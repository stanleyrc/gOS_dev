#!/usr/bin/env python3
"""Sampled tumour regions per patient -> <data>/_cohort/regions.json.

Every cell directory <data>/<cell>/metadata.json has patient_id and a `region` field (MR_2, MR2, normal, or, for BWH69, a well
name). Regions are normalised MR2 -> MR_2; "normal" cells are skipped; when `region` is not an MR label the region is read from
the cell name (BWH69_MR_2_tube1_... -> MR_2). Output: { format, source, patients: { P: { regions: [...], n_regions, n_cells } } }.
Usage: export_regions.py <data dir> [out.json]
"""
import collections, datetime, json, os, re, sys

MR = re.compile(r"^MR_?(\d+)$", re.I)

def region_of(name, meta):
    r = str(meta.get("region") or "").strip()
    if r.lower() == "normal":
        return None
    m = MR.match(r)
    if m:
        return f"MR_{m.group(1)}"
    m = re.search(r"_(MR_?\d+)_", name)
    if m:
        return MR.match(m.group(1)) and f"MR_{MR.match(m.group(1)).group(1)}"
    return None

def main(data, out):
    regs, cells = collections.defaultdict(set), collections.Counter()
    for d in sorted(os.listdir(data)):
        p = os.path.join(data, d, "metadata.json")
        if d.startswith("_") or not os.path.isfile(p):
            continue
        try:
            meta = json.load(open(p))
        except Exception:
            continue
        meta = meta[0] if isinstance(meta, list) and meta else meta
        if not isinstance(meta, dict) or meta.get("entry_type", "cell") != "cell" or not meta.get("patient_id"):
            continue
        r = region_of(d, meta)
        if r:
            regs[meta["patient_id"]].add(r)
            cells[meta["patient_id"]] += 1
    res = {"format": "gos-sc-regions/1", "created": datetime.datetime.now().isoformat(timespec="seconds"),
           "source": "cell metadata.json `region` field (normalised MR2 -> MR_2; BWH69 from the cell name; normal cells skipped)",
           "patients": {k: {"regions": sorted(v), "n_regions": len(v), "n_cells": cells[k]} for k, v in sorted(regs.items())}}
    json.dump(res, open(out, "w"), indent=1)
    print({k: v["n_regions"] for k, v in res["patients"].items()}, sum(v["n_regions"] for v in res["patients"].values()))

if __name__ == "__main__":
    d = sys.argv[1]
    main(d, sys.argv[2] if len(sys.argv) > 2 else os.path.join(d, "_cohort", "regions.json"))
