// Two-axis coverage (docs/track_spec.md, "coverage"): the plotted value is the dryclean foreground f; the left
// axis is CN from the unit's purity p and ploidy psi, the right axis is "expected depth (x)" = f x mean depth.

const ok = (x) => x != null && Number.isFinite(Number(x));
const purityOf = (p) => (ok(p) && p > 0 && p <= 1 ? Number(p) : 1);

/** CN = (f (p psi + 2 (1 - p)) - 2 (1 - p)) / p; with p = 1, CN = f psi. */
export function cnFromForeground(f, purity, ploidy) {
  const p = purityOf(purity);
  return (f * (p * ploidy + 2 * (1 - p)) - 2 * (1 - p)) / p;
}

/** Inverse: f = (p CN + 2 (1 - p)) / (p psi + 2 (1 - p)). Used for files that store foregroundabs (value: "cn"). */
export function foregroundFromCn(cn, purity, ploidy) {
  const p = purityOf(purity);
  return (p * cn + 2 * (1 - p)) / (p * ploidy + 2 * (1 - p));
}

export const expectedDepth = (f, meanDepth) => f * meanDepth;

/** The unit's fit as used by the axes; reason says why an axis is not available. */
export function unitFit(unit) {
  const ploidy = ok(unit?.ploidy) && Number(unit.ploidy) > 0 ? Number(unit.ploidy) : null;
  const meanDepth = ok(unit?.mean_depth) && Number(unit.mean_depth) > 0 ? Number(unit.mean_depth) : null;
  return {
    purity: purityOf(unit?.purity),
    ploidy,
    meanDepth,
    cnReason: ploidy == null ? "no ploidy for this unit" : null,
    depthReason: meanDepth == null ? "no mean depth for this unit" : null,
  };
}

function niceStep(max, count) {
  const raw = max / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || 10 * pow;
}

/** Nice values from 0 to max (inclusive when it lands on a step), about `count` of them. */
export function niceTicks(max, count = 3) {
  if (!(max > 0)) return [0];
  const step = niceStep(max, count);
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Number(v.toPrecision(6)));
  return out;
}

/**
 * Axis ticks for one unit's coverage row, as positions in f (the plotted value).
 * fMax: the top of the row in f. Returns { left: [{ f, label }], right: [{ f, label }], leftTitle, rightTitle }.
 */
export function coverageAxes(fit, fMax, count = 3) {
  const out = { left: [], right: [], leftTitle: "", rightTitle: "" };
  if (fit.ploidy != null) {
    const cnMax = cnFromForeground(fMax, fit.purity, fit.ploidy);
    out.left = niceTicks(cnMax, count).map((cn) => ({ f: foregroundFromCn(cn, fit.purity, fit.ploidy), label: `${cn}` }));
    out.leftTitle = `CN (p ${fit.purity.toFixed(2)}, ψ ${fit.ploidy.toFixed(2)})`;
  } else {
    out.leftTitle = `CN not available (${fit.cnReason})`;
  }
  if (fit.meanDepth != null) {
    const dMax = expectedDepth(fMax, fit.meanDepth);
    out.right = niceTicks(dMax, count).map((d) => ({ f: d / fit.meanDepth, label: `${d}` }));
    out.rightTitle = `expected depth (×), mean ${fit.meanDepth.toFixed(1)}×`;
  } else {
    out.rightTitle = `expected depth not available (${fit.depthReason})`;
  }
  return out;
}
