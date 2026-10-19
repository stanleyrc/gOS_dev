// Whole-gene context of a splicing cluster (d3-free, tested): the canonical transcript with its exon numbers, the
// other transcripts collapsed, an intron-compressed layout, and a description of the aberrant junction relative to the
// canonical splice sites ("exon 10 of 11", "novel acceptor 44 bp into the intron", length change, frame).
// Junctions are introns, 1-based inclusive (first..last intronic base), as in rna/splicing.json; exon models come
// from _cohort/rna/splice_exons.json.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Union of intervals [{ start, end }] (touching or overlapping ones merged), sorted. */
export function unionIntervals(list) {
  const sorted = list.map((e) => ({ start: num(e.start), end: num(e.end) })).sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  sorted.forEach((e) => {
    const last = out[out.length - 1];
    if (last && e.start <= last.end + 1) last.end = Math.max(last.end, e.end);
    else out.push({ ...e });
  });
  return out;
}

/**
 * The whole gene of a cluster: canonical transcript exons numbered along the transcript direction over the whole
 * transcript, the other transcripts, and the span. null when the gene has no exon model.
 * @returns { gene, chromosome, strand, start, end, canonical: { id, exons: [{ start, end, n }] }, nExons, others: [{ id, exons }], backbone }
 */
export function geneContext(model, cluster) {
  const g = model?.genes?.[cluster?.gene];
  if (!g || !(g.transcripts || []).length) return null;
  const minus = (g.strand || cluster.strand) === "-";
  const number = (t) => {
    const sorted = (t.exons || []).map(([s, e]) => ({ start: num(s), end: num(e) })).sort((a, b) => a.start - b.start);
    return sorted.map((e, i) => ({ ...e, n: minus ? sorted.length - i : i + 1 }));
  };
  const all = g.transcripts.map((t) => ({ id: t.id, canonical: Boolean(t.canonical), exons: number(t) })).filter((t) => t.exons.length);
  if (!all.length) return null;
  const canonical = all.find((t) => t.canonical) || [...all].sort((a, b) => b.exons.length - a.exons.length)[0];
  const others = all.filter((t) => t !== canonical);
  const backbone = unionIntervals([...canonical.exons, ...others.flatMap((t) => t.exons)]);
  return {
    gene: cluster.gene,
    chromosome: g.chrom || cluster.chromosome,
    strand: g.strand || cluster.strand,
    start: backbone[0].start,
    end: backbone[backbone.length - 1].end,
    canonical: { id: canonical.id, exons: canonical.exons },
    nExons: canonical.exons.length,
    others,
    backbone,
  };
}

/**
 * Intron-compressed layout: exon blocks (union of all transcripts) get a width proportional to their length (at least
 * minExon px), every intron gets intronPx; positions inside an intron are interpolated linearly in it.
 * @returns { x(pos), blocks: [{ start, end, x0, x1 }], width }
 */
export function compressedLayout(backbone, width, { intronPx = 26, minExon = 5, pad = 8 } = {}) {
  const blocks0 = unionIntervals(backbone);
  if (!blocks0.length) return { x: () => pad, blocks: [], width };
  const avail = Math.max(40, width - 2 * pad);
  const nIntrons = blocks0.length - 1;
  const bp = blocks0.reduce((a, b) => a + (b.end - b.start + 1), 0);
  let ip = intronPx;
  let scale = Math.max(1e-9, (avail - nIntrons * ip) / bp);
  const widthsOf = () => blocks0.map((b) => Math.max(minExon, (b.end - b.start + 1) * scale));
  let w = widthsOf();
  let total = w.reduce((a, v) => a + v, 0) + nIntrons * ip;
  if (total > avail) {
    // many tiny exons: shrink introns first, then everything
    ip = Math.max(4, (avail - w.reduce((a, v) => a + v, 0)) / Math.max(1, nIntrons));
    total = w.reduce((a, v) => a + v, 0) + nIntrons * ip;
    if (total > avail) {
      const f = avail / total;
      w = w.map((v) => v * f);
      ip *= f;
    }
  }
  let cursor = pad;
  const blocks = blocks0.map((b, i) => {
    const x0 = cursor;
    cursor += w[i] + (i < nIntrons ? ip : 0);
    return { ...b, x0, x1: x0 + w[i] };
  });
  const x = (pos) => {
    const p = num(pos);
    if (p <= blocks[0].start) return blocks[0].x0;
    for (let i = 0; i < blocks.length; i += 1) {
      const b = blocks[i];
      if (p <= b.end) return b.x0 + ((p - b.start) / Math.max(1, b.end - b.start + 1)) * (b.x1 - b.x0);
      const nx = blocks[i + 1];
      if (nx && p < nx.start) return b.x1 + ((p - b.end) / Math.max(1, nx.start - b.end)) * (nx.x0 - b.x1);
    }
    return blocks[blocks.length - 1].x1;
  };
  return { x, blocks, width };
}

/** Nearest value of `list` to v and the signed distance v - nearest. */
function nearest(list, v) {
  let best = null;
  list.forEach((c) => {
    if (best == null || Math.abs(v - c) < Math.abs(v - best)) best = c;
  });
  return best == null ? null : { site: best, delta: v - best };
}

/**
 * Where a junction's two ends sit relative to the canonical splice sites. For the left end the last exonic base is
 * start - 1 (compared with canonical exon ends), for the right end the first exonic base is end + 1 (compared with exon
 * starts); delta != 0 means the end is shifted from the canonical site (positive = to the right).
 * @returns { left, right, skipped, lengthChange } or null without a gene model
 */
export function junctionGeometry(ctx, junction) {
  if (!ctx || !junction) return null;
  const exons = ctx.canonical.exons;
  const minus = ctx.strand === "-";
  const s = num(junction.start);
  const e = num(junction.end);
  const end = (side, pos, list, boundary) => {
    const hit = nearest(list, pos);
    const ex = exons.find((x) => x[boundary] === hit.site);
    const inside = exons.some((x) => pos >= x.start && pos <= x.end);
    // donor on the + strand's left end and on the - strand's right end
    const kind = (side === "left") === !minus ? "donor" : "acceptor";
    return { side, pos, delta: hit.delta, exon: ex ? ex.n : null, where: hit.delta === 0 ? "site" : inside ? "exon" : "intron", kind };
  };
  const left = end("left", s - 1, exons.map((x) => x.end), "end");
  const right = end("right", e + 1, exons.map((x) => x.start), "start");
  const skipped = exons.filter((x) => x.start >= s && x.end <= e).map((x) => x.n).sort((a, b) => a - b);
  // transcript length change vs the canonical splice: gained at the left end by +delta, at the right end by -delta, minus skipped exons
  const skippedBp = exons.filter((x) => x.start >= s && x.end <= e).reduce((a, x) => a + (x.end - x.start + 1), 0);
  const lengthChange = left.delta - right.delta - (left.delta === 0 && right.delta === 0 ? skippedBp : 0);
  return { left, right, skipped, lengthChange };
}

const EVENT_NAMES = {
  cassette: "cassette exon (skipping / inclusion)",
  alt3: "alternative 3′ splice site",
  alt5: "alternative 5′ splice site",
  junction: "junction share",
};

/**
 * Plain-language description of the aberrant junction of a cluster (the first non-annotated one, else the first
 * junction of the event).
 * @param ctx geneContext(); cluster; event from clusterEvents (or null); junctionIdx index into cluster.junctions
 * @returns { exonLabel, eventType, site, lengthChange, frame, domain }
 */
export function describeEvent(ctx, cluster, event, junctionIdx = null) {
  const js = cluster?.junctions || [];
  let k = junctionIdx ?? event?.focus?.[0] ?? null;
  if (k == null) {
    const ab = js.findIndex((j) => j.annotated === false || (j.type && j.type !== "annotated"));
    k = ab >= 0 ? ab : event?.junctions?.incl?.[0] ?? 0;
  }
  const j = js[k];
  const geo = ctx && j ? junctionGeometry(ctx, j) : null;
  const total = ctx?.nExons ?? null;
  const out = { junction: k, exonLabel: null, exonN: null, exonTotal: total, eventType: null, site: null, lengthChange: null, frame: null, domain: null };
  if (event?.type === "cassette" && event.exonNumber != null) {
    out.exonN = event.exonNumber;
    out.exonLabel = total ? `exon ${event.exonNumber} of ${total}` : `exon ${event.exonNumber}`;
    out.eventType = "cassette exon";
  }
  if (geo) {
    out.lengthChange = geo.lengthChange;
    const shifted = [geo.left, geo.right].filter((x) => x.delta !== 0);
    if (shifted.length) {
      const sh = shifted.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
      out.exonN = out.exonN ?? sh.exon;
      if (!out.exonLabel && sh.exon != null) out.exonLabel = total ? `exon ${sh.exon} of ${total}` : `exon ${sh.exon}`;
      const bp = Math.abs(sh.delta);
      out.site = `${sh.kind === "acceptor" ? "novel acceptor" : "novel donor"} ${bp} bp ${sh.where === "exon" ? "inside the exon" : "into the intron"} (canonical ${sh.kind} base ${(sh.pos - sh.delta).toLocaleString("en-US")})`;
      out.eventType = out.eventType || (sh.kind === "acceptor" ? "alternative 3′ site" : "alternative 5′ site");
      out.nearestBp = bp;
    } else if (geo.skipped.length) {
      const a = geo.skipped[0];
      const b = geo.skipped[geo.skipped.length - 1];
      out.exonN = out.exonN ?? a;
      if (!out.exonLabel) out.exonLabel = total ? `exon${a === b ? ` ${a}` : `s ${a}–${b}`} of ${total}` : `exon${a === b ? ` ${a}` : `s ${a}–${b}`}`;
      out.eventType = out.eventType || "exon skipping";
      out.nearestBp = 0;
    } else {
      out.nearestBp = 0;
    }
  }
  if (event?.variant && out.exonLabel) {
    const m = out.exonLabel.match(/^exons? ([\d\u2013]+)/);
    out.eventType = `${event.variant} (\u0394 exons ${m ? m[1] : "?"})`;
  }
  if (!out.eventType) out.eventType = EVENT_NAMES[event?.type] || (j?.type && j.type !== "annotated" ? j.type.replace(/_/g, " ") : "annotated junction");
  if (out.lengthChange != null && out.lengthChange !== 0) out.frame = out.lengthChange % 3 === 0 ? "in frame (estimated)" : "frameshift (estimated)";
  return out;
}

/** Domain context of the affected exon: the exon model carries none, so say so. */
export function domainContext(model, gene) {
  const g = model?.genes?.[gene];
  const withDomains = g && (g.domains || (g.transcripts || []).some((t) => t.domains));
  return withDomains ? { available: true } : { available: false, reason: "splice_exons.json carries no protein-domain annotation" };
}

/**
 * Arc geometry for the cluster's junctions on a layout: each junction runs from the last exonic base of its left end
 * to the first exonic base of its right end.
 */
export function junctionArcs(layout, cluster) {
  return (cluster?.junctions || []).map((j, k) => {
    const xa = layout.x(num(j.start) - 1);
    const xb = layout.x(num(j.end) + 1);
    return { k, xa: Math.min(xa, xb), xb: Math.max(xa, xb), aberrant: j.annotated === false || (j.type && j.type !== "annotated") };
  });
}

/** Zoom/pan of a 1-D view [0, width]: wheel zoom about the cursor, clamped. view = { k, tx } (screen = k * x + tx). */
export function zoomView(view, factor, cx, width, maxK = 40) {
  const k = Math.min(maxK, Math.max(1, view.k * factor));
  const f = k / view.k;
  let tx = cx - (cx - view.tx) * f;
  tx = Math.min(0, Math.max(width - width * k, tx));
  return { k, tx };
}

const sameJ = (a, j) => Boolean(a) && num(a.start) === num(j.start) && num(a.end) === num(j.end);

/**
 * Events pinned to junctions the exports name: known variants (EGFRvIII: alt_junction against ref_junction) and the
 * findings of this cluster that carry a junction. They come before the geometry-derived events, so the representative
 * junction of a 14-junction cluster is the one the finding is about, not its first novel acceptor.
 * @param cohort the cohort splicing.json ({ variants, findings }); returns [{ type: "junction", label, variant?, focus, junctions }]
 */
export function pinnedEvents(cluster, cohort) {
  const js = cluster?.junctions || [];
  const n = js.length;
  const out = [];
  const seen = new Set();
  const others = (k) => js.map((_, i) => i).filter((i) => i !== k);
  (cohort?.variants || []).forEach((v) => {
    if (v.gene !== cluster.gene) return;
    const k = js.findIndex((j) => sameJ(v.alt_junction, j));
    if (k < 0 || seen.has(k)) return;
    seen.add(k);
    const r = js.findIndex((j) => sameJ(v.ref_junction, j));
    out.push({ type: "junction", variant: v.id, label: v.description ? `${v.id}: ${v.description}` : v.id, focus: [k], junctions: { incl: [k], skip: r >= 0 ? [r] : others(k) } });
  });
  (cohort?.findings || []).forEach((f) => {
    if (f.cluster_id !== cluster.id || !f.junction) return;
    const k = js.findIndex((j) => sameJ(f.junction, j));
    if (k < 0 || seen.has(k) || n < 2) return;
    seen.add(k);
    out.push({ type: "junction", label: `finding junction ${k + 1} (${js[k].type || "novel"})`, focus: [k], junctions: { incl: [k], skip: others(k) } });
  });
  return out;
}
