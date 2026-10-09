// Exon models and named events for splicing clusters (d3-free, tested).
// Junctions are introns, 1-based inclusive (first..last intronic base), as in
// the rna/splicing.json exports; exon models come from
// _cohort/rna/splice_exons.json (srctools gos_sc_splice_exons.py).

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Transcripts of a cluster's gene restricted to the cluster window (the exons
 * holding the junction ends and everything between), each exon numbered along
 * the transcript's direction over the whole transcript.
 * @returns [{ id, canonical, exons: [{ start, end, n }] }] (canonical first) or []
 */
export function clusterTranscripts(model, cluster) {
  const g = model?.genes?.[cluster?.gene];
  const js = cluster?.junctions || [];
  if (!g || !js.length) return [];
  const lo = Math.min(...js.map((j) => num(j.start) - 1));
  const hi = Math.max(...js.map((j) => num(j.end) + 1));
  const minus = (g.strand || cluster.strand) === "-";
  return (g.transcripts || [])
    .map((t) => {
      const sorted = (t.exons || []).map(([s, e]) => ({ start: num(s), end: num(e) })).sort((a, b) => a.start - b.start);
      const numbered = sorted.map((e, i) => ({ ...e, n: minus ? sorted.length - i : i + 1 }));
      return { id: t.id, canonical: Boolean(t.canonical), exons: numbered.filter((e) => e.end >= lo && e.start <= hi) };
    })
    .filter((t) => t.exons.length > 0);
}

/** Canonical (else first) transcript's exon matching [start, end] exactly, else overlapping it. */
function exonNumber(transcripts, start, end) {
  const order = [...transcripts].sort((a, b) => Number(b.canonical) - Number(a.canonical));
  for (const t of order) {
    const hit = t.exons.find((e) => e.start === start && e.end === end) || t.exons.find((e) => e.start <= end && e.end >= start);
    if (hit) return { n: hit.n, transcript: t.id, exact: hit.start === start && hit.end === end };
  }
  return null;
}

/**
 * Named events of a cluster from its junctions:
 *  - cassette exon: skip junction (a..d) with inclusion junctions (a..b) and (c..d), b < c;
 *    the exon is [b + 1, c - 1]; PSI = mean(inclusion reads) / (that + skip reads);
 *  - alternative 3' / 5' site: junctions sharing one end (the strand decides 3' vs 5');
 *    PSI = share of the junction ending closest to the shared end (the shorter intron).
 * @returns [{ type, label, junctions: { incl: [j], skip: [j] }, exon?, exonNumber? }]
 */
export function clusterEvents(cluster, transcripts = []) {
  const js = (cluster?.junctions || []).map((j, k) => ({ k, start: num(j.start), end: num(j.end) }));
  const minus = cluster?.strand === "-";
  const events = [];
  const used = new Set();
  js.forEach((skip) => {
    js.forEach((a) => {
      if (a.k === skip.k || a.start !== skip.start || a.end >= skip.end) return;
      js.forEach((b) => {
        if (b.k === skip.k || b.k === a.k || b.end !== skip.end || b.start <= a.end + 1) return;
        const exon = { start: a.end + 1, end: b.start - 1 };
        const ex = exonNumber(transcripts, exon.start, exon.end);
        events.push({
          type: "cassette",
          exon,
          exonNumber: ex?.n ?? null,
          exact: ex?.exact ?? false,
          label: ex?.n != null ? `exon ${ex.n} inclusion` : `cassette exon inclusion`,
          junctions: { incl: [a.k, b.k], skip: [skip.k] },
        });
        [a.k, b.k, skip.k].forEach((k) => used.add(k));
      });
    });
  });
  const share = (key, kind) => {
    const groups = new Map();
    js.forEach((j) => {
      const v = j[key];
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v).push(j);
    });
    groups.forEach((g) => {
      if (g.length < 2 || g.every((j) => used.has(j.k))) return;
      // the junction with the shorter intron is "inclusion" of the extra exonic sequence
      const sorted = [...g].sort((x, y) => x.end - x.start - (y.end - y.start));
      events.push({ type: kind, label: kind === "alt3" ? "alternative 3′ site" : "alternative 5′ site", junctions: { incl: [sorted[0].k], skip: sorted.slice(1).map((j) => j.k) } });
    });
  };
  // shared start: on + the donor (5') is shared, so the acceptors (3') differ; reversed on -
  share("start", minus ? "alt5" : "alt3");
  share("end", minus ? "alt3" : "alt5");
  return events;
}

/** PSI of an event from per-junction counts: { psi, reads } (psi NaN without reads). */
export function eventPsi(counts, event) {
  const incl = event.junctions.incl.map((k) => num(counts?.[k]));
  const skip = event.junctions.skip.reduce((a, k) => a + num(counts?.[k]), 0);
  const inc = event.type === "cassette" ? incl.reduce((a, v) => a + v, 0) / incl.length : incl.reduce((a, v) => a + v, 0);
  const reads = incl.reduce((a, v) => a + v, 0) + skip;
  return { psi: inc + skip > 0 ? inc / (inc + skip) : NaN, reads };
}

/**
 * Per-cell event PSI from a patient's cluster (cells: { rnaId: counts }) for cells with
 * >= minReads reads on the event's junctions: [{ id, psi, reads }].
 */
export function cellEventPsi(cluster, event, minReads = 3) {
  return Object.entries(cluster?.cells || {})
    .map(([id, counts]) => ({ id, ...eventPsi(counts, event) }))
    .filter((c) => c.reads >= minReads && Number.isFinite(c.psi));
}
