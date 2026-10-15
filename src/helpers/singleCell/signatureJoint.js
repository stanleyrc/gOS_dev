// Joint (patient signature set) refit of the SNV site sets, signatures_joint.json
// (skilift sc_refit_signatures_joint; srctools gos_sc_upload.R STEPS=signatures_joint):
// one signature set per patient, NNLS refit of every site set, bootstrap CIs and
// per-signature subclonal / private / clone / clade vs truncal tests. The legacy
// signatures.json fits every set independently against all of COSMIC.
// d3-free so it can be tested on synthetic fixtures.

export const FIT_JOINT = "joint";
export const FIT_LEGACY = "legacy";
const Q_CUTOFF = 0.05;

/** The fit the Signatures tab shows: the joint fit by default when its file exists. */
export const sigFitMode = (layout, hasJoint) => (hasJoint && layout?.sigFit !== FIT_LEGACY ? FIT_JOINT : FIT_LEGACY);

const isOk = (src) => src?.status === "ok" && src.data && Array.isArray(src.data.sets);

/**
 * The signatures source ({ status, data }) all consumers read: the joint file in
 * joint mode (same sets / activities shape as signatures.json, plus CIs and a
 * `fit: "joint"` flag), else the legacy file.
 */
export function effectiveSignatures(legacy, joint, mode, includeCandidates = false) {
  if (mode === FIT_JOINT && isOk(joint)) {
    const data = { ...joint.data, fit: FIT_JOINT };
    if (includeCandidates) {
      const cands = candidateSignatures(joint.data);
      if (cands.length) {
        data.candidatesIncluded = true;
        data.sets = data.sets.map((set) => {
          const mine = cands.filter((c) => c.set === set.name);
          if (!mine.length) return set;
          const total = (set.activities || []).reduce((acc, a) => acc + (Number(a.activity) || 0), 0);
          const share = mine.reduce((acc, c) => acc + c.frac, 0);
          // candidates take their fraction of the set; the patient-set exposures shrink to the rest
          const scaled = (set.activities || []).map((a) => ({ ...a, activity: (Number(a.activity) || 0) * (1 - share) }));
          const added = mine.map((c) => ({ signature: c.signature, activity: c.frac * total, candidate: true }));
          return { ...set, activities: [...scaled, ...added] };
        });
      }
    }
    return { status: "ok", data };
  }
  return legacy;
}

/** Likelihood-ratio threshold of a candidate signature: Bonferroni over the ~80 COSMIC signatures not in the set. */
export const CANDIDATE_P = 0.05 / 80;

/**
 * Signatures the independent fits reported that pass the likelihood-ratio test on top of the patient set
 * but fail the selection thresholds (>= 5% exposure, >= 0.02 cosine gain, >= 80% bootstrap support):
 * [{ signature, set, frac, lo, hi, delta_loglik, p, cosine_gain, support }].
 */
export function candidateSignatures(joint) {
  const out = [];
  (joint?.legacy_dropped || []).forEach((d) =>
    [].concat(d.checks || []).forEach((c) => {
      if (c.p != null && Number(c.p) < CANDIDATE_P && Number(c.frac) > 0.01) out.push({ signature: d.signature, ...c });
    })
  );
  return out.sort((a, b) => b.frac - a.frac);
}

/** [{ signature, source, set, detail, stability }] of the patient set, base signatures first. */
export function patientSet(joint) {
  const rows = (joint?.signature_set || []).map((r) => ({
    signature: r.signature,
    source: r.source,
    set: r.set,
    detail: r.detail,
    stability: r.stability == null ? null : Number(r.stability),
  }));
  return rows.sort((a, b) => (a.source === b.source ? 0 : a.source === "base" ? -1 : 1));
}

/**
 * Signatures the legacy fits reported that the patient set does not contain:
 * [{ signature, sets, checks: [{ set, frac, lo, hi, delta_loglik, p, cosine_gain, support }] }];
 * checks = evidence for the signature when added to the patient set, in each set the legacy fit reported it.
 */
export function droppedSignatures(joint) {
  return (joint?.legacy_dropped || []).map((d) => ({
    signature: d.signature,
    sets: [].concat(d.legacy_sets || []),
    checks: [].concat(d.checks || []),
  }));
}

/** Exposure bars of one set: [{ signature, fraction, lo, hi, count }] largest first (CI = bootstrap 95%). */
export function exposureBars(joint, setName) {
  const set = (joint?.sets || []).find((s) => s.name === setName);
  if (!set) return [];
  return (set.activities || [])
    .filter((a) => a.fraction != null)
    .map((a) => ({ signature: a.signature, fraction: Number(a.fraction), lo: Number(a.lo), hi: Number(a.hi), count: Number(a.activity) }))
    .sort((a, b) => b.fraction - a.fraction);
}

/** Names of the sets in display order: tree sets, clone-specific, clades, then the legacy clone definition. */
export function jointSetNames(joint) {
  const rank = (s) => ({ tree: 0, clone: 1, clade: 2, clone_legacy: 3 }[s.group] ?? 4);
  return (joint?.sets || [])
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map(({ s }) => s.name);
}

/** Contrast tables: [{ contrast, a, b, n_a, n_b, rows }] of a patient file. */
export const contrastsOf = (joint) => joint?.contrasts || [];

/** A contrast row is significant when its CI excludes 0 and BH q <= 0.05. */
export const isSignificant = (r) => r.q != null && Number(r.q) <= Q_CUTOFF && (Number(r.lo) > 0 || Number(r.hi) < 0);

/** Rows of one contrast ordered by |difference|, with a `significant` flag. */
export function contrastRows(contrast) {
  return (contrast?.rows || [])
    .map((r) => ({ ...r, diff: Number(r.diff), lo: Number(r.lo), hi: Number(r.hi), significant: isSignificant(r) }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/**
 * Cohort table: signatures whose exposure differs between a non-truncal set and
 * truncal in at least one patient. cohort = _cohort/signatures_joint.json.
 * @returns [{ signature, contrast, patients: [{ patient, diff, lo, hi, p, q }], direction }]
 */
export function cohortDifferences(cohort, { onlySignificant = true } = {}) {
  const groups = new Map();
  (cohort?.contrasts || []).forEach((r) => {
    if (onlySignificant && !isSignificant(r)) return;
    const key = `${r.contrast}|${r.signature}`;
    if (!groups.has(key)) groups.set(key, { signature: r.signature, contrast: r.contrast, patients: [] });
    groups.get(key).patients.push({ patient: r.patient, diff: Number(r.diff), lo: Number(r.lo), hi: Number(r.hi), p: r.p, q: r.q });
  });
  return [...groups.values()]
    .map((g) => {
      const up = g.patients.filter((p) => p.diff > 0).length;
      return { ...g, direction: up === g.patients.length ? "higher in the non-truncal set" : up === 0 ? "lower in the non-truncal set" : "mixed" };
    })
    .sort((a, b) => b.patients.length - a.patients.length || a.signature.localeCompare(b.signature, undefined, { numeric: true }));
}

/** "0.12 [0.03, 0.20]" */
export const fmtDiff = (r) => `${r.diff >= 0 ? "+" : ""}${r.diff.toFixed(3)} [${r.lo.toFixed(3)}, ${r.hi.toFixed(3)}]`;
export const fmtP = (p) => (p == null ? "–" : Number(p) < 0.001 ? Number(p).toExponential(1) : Number(p).toFixed(3));
