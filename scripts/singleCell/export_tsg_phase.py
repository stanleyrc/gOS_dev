#!/usr/bin/env python3
"""Phase (cis / trans) of damaging SNV pairs in the same tumour-suppressor gene -> <data>/_cohort/tsg_phase.json.

For every patient, every pair of single-base damaging SNVs (truncating / splice / loss-of-function or tier 1-2 missense, from
filtered.events.json) in the same gene and <= MAX_DIST bp apart, count the read fragments (same read name and cell, mates merged)
that cover both sites in <patient>/slices/drivers.dna.bam:
  alt/alt   both variant alleles on one fragment  -> same chromosome copy (cis)
  alt/ref, ref/alt                                  -> different copies, when no alt/alt fragment is seen (trans)
relation = "trans" when alt/alt <= 5% of the informative fragments and both single-alt classes have >= MIN_FRAGS;
"cis" when single-alt fragments <= 5% of alt/alt and alt/alt >= MIN_FRAGS; otherwise null with a reason.
Pairs farther apart than MAX_DIST or without spanning fragments are written with relation null and the reason (not computable).
Usage: export_tsg_phase.py <data dir> [out.json]     (needs pysam: the mskilab_ne1 conda env)
"""
import collections, itertools, json, os, re, sys

MAX_DIST = 1000
MIN_FRAGS = 10
DAMAGING = ("trunc", "splice")

def damaging(e):
    t = (e.get("type") or "").lower()
    if t in DAMAGING: return True
    if t == "missense":
        return "loss" in (e.get("effect") or "").lower() or (isinstance(e.get("Tier"), (int, float)) and e["Tier"] <= 2)
    return False

def snv_site(e):
    m = re.match(r"^(\w+):(\d+)-(\d+) ([ACGT])>([ACGT])$", e.get("Variant_g") or "")
    return (m.group(1), int(m.group(2)), m.group(4), m.group(5)) if m and m.group(2) == m.group(3) else None

def base_at(read, pos):
    for qp, rp in read.get_aligned_pairs():
        if rp == pos - 1 and qp is not None: return read.query_sequence[qp]
    return None

def main():
    import pysam
    data = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(data, "_cohort", "tsg_phase.json")
    res = {}
    cohort = sorted(json.load(open(os.path.join(data, "_cohort", "tsg_loss.json")))["patients"])  # the cohort patients (not the per-plate folders)
    for p in cohort:
        ev = json.load(open(os.path.join(data, p, "filtered.events.json")))
        ev = ev if isinstance(ev, list) else ev.get("events", [])
        by = collections.defaultdict(dict)
        for e in ev:
            if e.get("vartype") == "SNV" and damaging(e) and e.get("gene"):
                s = snv_site(e)
                by[e["gene"]][s if s else (e.get("Genome_Location"), e.get("Variant"))] = e
        pairs = []
        for g, sites in by.items():
            for a, b in itertools.combinations(sorted(sites, key=lambda s: str(s)), 2):
                pairs.append((g, a, b))
        bam_path = os.path.join(data, p, "slices", "drivers.dna.bam")
        bam = pysam.AlignmentFile(bam_path) if os.path.isfile(bam_path) else None
        for g, a, b in pairs:
            rec = {"a": "%s:%s" % (a[0], a[1]) if len(a) == 4 else str(a), "b": "%s:%s" % (b[0], b[1]) if len(b) == 4 else str(b), "relation": None}
            if len(a) != 4 or len(b) != 4: rec["reason"] = "not computable: an indel / splice site (only single-base sites are phased)"
            elif a[0] != b[0] or abs(a[1] - b[1]) > MAX_DIST: rec["reason"] = "not computable: sites more than %d bp apart (no spanning fragments)" % MAX_DIST
            elif bam is None: rec["reason"] = "not computable: no slices/drivers.dna.bam"
            else:
                ctg = next((c for c in (a[0], "chr" + a[0]) if c in bam.references), None)
                lo, hi = sorted((a[1], b[1]))
                fr = collections.defaultdict(dict)
                for r in bam.fetch(ctg, lo - 1, hi):
                    if r.is_secondary or r.is_supplementary: continue
                    cell = r.get_tag("RG") if r.has_tag("RG") else ""
                    for s in (a, b):
                        x = base_at(r, s[1])
                        if x: fr[(r.query_name, cell)][s[1]] = x
                c = collections.Counter(); cells = set()
                for (n, cell), bs in fr.items():
                    if a[1] in bs and b[1] in bs:
                        k = (bs[a[1]] == a[3], bs[b[1]] == b[3]); ok = (bs[a[1]] in (a[2], a[3])) and (bs[b[1]] in (b[2], b[3]))
                        if ok: c[k] += 1; cells.add(cell)
                aa, ar, ra, rr = c[(True, True)], c[(True, False)], c[(False, True)], c[(False, False)]
                rec.update({"altAlt": aa, "altRef": ar, "refAlt": ra, "refRef": rr, "cells": len(cells)})
                single = ar + ra
                if aa <= 0.05 * (aa + single) and ar >= MIN_FRAGS and ra >= MIN_FRAGS: rec["relation"] = "trans"
                elif single <= 0.05 * aa and aa >= MIN_FRAGS: rec["relation"] = "cis"
                else: rec["reason"] = "not computable: %d fragments cover both sites with a single-alt / alt-alt mix that does not resolve" % (aa + single)
            rec["fragments"] = rec.get("altAlt", 0) + rec.get("altRef", 0) + rec.get("refAlt", 0)
            res.setdefault(p, {}).setdefault(g, []).append(rec)
    json.dump({"source": "slices/drivers.dna.bam read fragments covering both sites (export_tsg_phase.py)", "patients": res}, open(out, "w"), indent=1)
    print("wrote", out, {p: {g: [r["relation"] for r in v] for g, v in d.items()} for p, d in res.items()})

if __name__ == "__main__":
    main()
