#!/usr/bin/env python3
"""Per-cell allelic state at tumour-suppressor genes -> <data>/_cohort/tsg_loss.json.

Source: each cell's allelic.json (two allele tracks of integer CN, hg19 intervals).
Per cell: ploidy = length-weighted median total CN over autosomes; per gene: the segment with the
largest overlap on each allele track -> (major, minor).  State codes:
  0 balanced (minor >= 1, total >= round(ploidy))   1 loss, both alleles kept (minor >= 1, total < ploidy)
  2 LOH by loss (minor 0, total < ploidy)           3 copy-neutral LOH (minor 0, total >= ploidy)
  4 homozygous deletion (total 0)                   -1 no allelic data / gene not covered
chrX / chrY are not called in allelic.json (both alleles 0 everywhere), so X-linked genes (ATRX) are left out.
Per patient also `normal` (1 = cell metadata clone_id is Normal), so the viewer can exclude normal cells.
Usage: export_tsg_loss.py <data dir> [out.json]
"""
import json, os, re, sys

TSG = {  # hg19 gene bodies
 "PTEN": ("10", 87863625, 87971930), "NF1": ("17", 31094927, 31382116), "TP53": ("17", 7661779, 7687550),
 "CDKN2A": ("9", 21967753, 21995301), "CDKN2B": ("9", 22002903, 22009312), "RB1": ("13", 48303726, 48599436),
 "PTPN2": ("18", 12785478, 12884294), "NF2": ("22", 29603556, 29698598),
 "LZTR1": ("22", 20982269, 20999032), "SMARCB1": ("22", 23786931, 23838008), "CHEK2": ("22", 28687743, 28742422),
 "ARID1A": ("1", 26693236, 26782104), "ARID1B": ("6", 156776020, 157210779), "KMT2C": ("7", 152134922, 152436005),
 "KMT2D": ("12", 49018975, 49059774), "SETD2": ("3", 47016429, 47163967), "BRCA1": ("17", 43044295, 43170245),
 "BRCA2": ("13", 32315086, 32400266), "ATM": ("11", 108222484, 108369102), "APC": ("5", 112707498, 112846239),
 "STK11": ("19", 1177558, 1228435), "CIC": ("19", 42268537, 42295797), "FUBP1": ("1", 77944055, 77979110),
 "PIK3R1": ("5", 68215756, 68301821), "SPRED1": ("15", 38544535, 38650509), "CDKN1B": ("12", 12715058, 12722369),
 "CDKN2C": ("1", 50960745, 50974634), "MAP3K1": ("5", 56815549, 56896152), "SMARCA4": ("19", 10960825, 11079426),
 "NOTCH1": ("9", 136494433, 136546048), "KEAP1": ("19", 10486125, 10503558), "B2M": ("15", 44711487, 44718877),
 "MLH1": ("3", 36993332, 37050918), "MSH2": ("2", 47402969, 47663146), "MSH6": ("2", 47695530, 47810101),
 "PMS2": ("7", 5970925, 6009106), "FAT1": ("4", 186587794, 186726722),
}

def tips(path):
    s = open(path).read()
    return re.findall(r"[(,]\s*([^():;,\[\]]+?)\s*(?=:|,|\))", s)

def cell_state(path, ploidy_cache):
    d = json.load(open(path))
    tr = {}
    for iv in d["intervals"]:
        tr.setdefault(iv["metadata"].get("color"), []).append((str(iv["chromosome"]), iv["startPoint"], iv["endPoint"], iv["y"]))
    if len(tr) != 2: return None
    a, b = list(tr.values())
    # total CN per aligned interval pair -> ploidy
    ba = {(c, s, e): y for c, s, e, y in b}
    lens = []
    for c, s, e, y in a:
        if c in ("X", "Y"): continue
        yb = ba.get((c, s, e))
        if yb is None: continue
        lens.append((y + yb, e - s + 1))
    if not lens: return None
    lens.sort(); half = sum(l for _, l in lens) / 2; acc = 0; ploidy = lens[-1][0]
    for t, l in lens:
        acc += l
        if acc >= half: ploidy = t; break
    def at(track, chrom, s, e):
        best, bo = None, 0
        for c, s2, e2, y in track:
            if c != chrom: continue
            o = min(e, e2) - max(s, s2) + 1
            if o > bo: best, bo = y, o
        return best
    out = {}
    for g, (c, s, e) in TSG.items():
        ya, yb = at(a, c, s, e), at(b, c, s, e)
        if ya is None or yb is None: out[g] = -1; continue
        tot, mn = ya + yb, min(ya, yb)
        if tot == 0: st = 4
        elif mn == 0: st = 3 if tot >= round(ploidy) else 2
        else: st = 1 if tot < round(ploidy) else 0
        out[g] = st
    return ploidy, out

def main():
    root = sys.argv[1]; outp = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "_cohort", "tsg_loss.json")
    res = {"source": "per-cell allelic.json (integer allele-specific CN); ploidy = length-weighted median total CN over autosomes",
           "codes": {"0": "balanced", "1": "loss, both alleles kept", "2": "LOH by loss (minor CN 0, total < ploidy)", "3": "copy-neutral LOH (minor CN 0, total >= ploidy)", "4": "homozygous deletion", "-1": "no data"},
           "genes": {g: {"chr": v[0], "start": v[1], "end": v[2]} for g, v in TSG.items()}, "patients": {}}
    pats = sorted(p for p in os.listdir(root) if os.path.isfile(os.path.join(root, p, "tree.nwk")))
    for p in pats:
        cells = [t for t in tips(os.path.join(root, p, "tree.nwk")) if os.path.isfile(os.path.join(root, t, "allelic.json"))]
        cells = sorted(set(cells))
        rows, ploidy = [], []
        for c in cells:
            r = cell_state(os.path.join(root, c, "allelic.json"), None)
            if r is None: rows.append(None); ploidy.append(None); continue
            ploidy.append(r[0]); rows.append(r[1])
        normal = []
        for c in cells:
            try: normal.append(1 if re.search("normal", str(json.load(open(os.path.join(root, c, "metadata.json")))[0].get("clone_id", "")), re.I) else 0)
            except Exception: normal.append(0)
        res["patients"][p] = {"cells": cells, "normal": normal, "ploidy": ploidy, "genes": {g: [(r[g] if r else -1) for r in rows] for g in TSG}}
        print(p, len(cells), flush=True)
    json.dump(res, open(outp, "w"), separators=(",", ":"))

if __name__ == "__main__":
    main()
