#!/usr/bin/env python3
"""Fill burden_per_mb (+ callable_mb, burden_per_mb_corrected) in data/<P>/clades.json and rebuild nothing else.
usage: fill_clades.py <tmb_export_root> <data_root> <out_root>   (writes <out_root>/<P>/clades.json; originals are not touched;
the caller copies with a .bak_261015 backup)."""
import json, sys, os
exp, data, out = sys.argv[1:4]
for p in sorted(os.listdir(exp)):
    tf = os.path.join(exp, p, "tmb.json")
    cf = os.path.join(data, p, "clades.json")
    if p.startswith("_") or not (os.path.exists(tf) and os.path.exists(cf)):
        continue
    tmb = {c["id"]: c for c in json.load(open(tf))["clades"]}
    cl = json.load(open(cf))
    n = 0
    for c in cl["clades"]:
        t = tmb.get(c["id"])
        if t is None:
            continue
        c["burden_per_mb"] = t["tmb_raw"]
        c["burden_per_mb_corrected"] = t["tmb_corrected"]
        c["callable_mb"] = t["callable_mb"]
        n += 1
    cl["denominator_mb"] = "burden_per_mb = clade private SNVs / Mb of the diploid autosomal territory with depth>=4 in >=2 clade cells (analysis/tmb, gos_sc_tmb.R); burden_per_mb_corrected also divides by the chance to detect alt reads in >=2 cells"
    os.makedirs(os.path.join(out, p), exist_ok=True)
    json.dump(cl, open(os.path.join(out, p, "clades.json"), "w"))
    print(p, n, "clades filled")
