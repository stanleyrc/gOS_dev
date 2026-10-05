#!/usr/bin/env python3
"""Generate the synthetic single-cell WGS demo dataset for gOS.

Every patient and every cell is an ordinary case folder under shared/data/,
holding the same per-case files a bulk case uses. The demo therefore doubles
as a reference for the expected layout:

  shared/datasets.json               adds the "demo-sc" dataset
  shared/datafiles_sc.json           manifest: entry_type "patient" | "cell"
  shared/data/<patient>/metadata.json
  shared/data/<patient>/tree.nwk     (optional; SC-PT01 only, the others are inferred)
  shared/data/<cell>/metadata.json   incl. cov_slope / cov_intercept, hets_slope / hets_intercept
  shared/data/<cell>/complex.json    genome graph: intervals (total CN) + ALT junctions
  shared/data/<cell>/allelic.json    major / minor allele CN intervals
  shared/data/<cell>/mutations.json  annotated SNVs (Gene, Alt_count, Ref_count, ...)
  shared/data/<cell>/coverage.arrow  binned read depth (x, y, color)
  shared/data/<cell>/hetsnps.arrow   het-SNP allele counts (x, y, color)

Usage: python3 scripts/generate_sc_demo.py   (deterministic; seed fixed)
Arrow files use pyarrow when installed, else scripts/arrow_minimal.py (needs `flatbuffers`).
"""

import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
from arrow_minimal import write_table  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "shared")
DATA = os.path.join(ROOT, "data")
MB = 1_000_000
COVERAGE_BIN = MB
READS_PER_COPY = 40.0  # coverage y = reads per bin; cov_slope converts to CN
HET_READS_PER_COPY = 10.0
DATASET_ID = "demo-sc"

rng = random.Random(20261005)

with open(os.path.join(ROOT, "settings.json")) as fh:
    SETTINGS = json.load(fh)
CHROMS = [c for c in SETTINGS["coordinates"]["sets"]["hg19"] if c["chromosome"] not in ("Y", "M")]
CHROM_LEN = {c["chromosome"]: c["endPoint"] for c in CHROMS}
CHROM_COLOR = {c["chromosome"]: c["color"] for c in CHROMS}
# Global coordinates exactly as gOS' updateChromoBins computes them.
START_PLACE = {}
_boundary = 0
for c in SETTINGS["coordinates"]["sets"]["hg19"]:
    START_PLACE[c["chromosome"]] = _boundary + c["startPoint"]
    _boundary += c["endPoint"]

DRIVERS = [
    ("TP53", "17", 7577120, "missense_variant", "p.Arg248Gln", "C>T"),
    ("PTEN", "10", 89692905, "stop_gained", "p.Arg130*", "C>T"),
    ("EGFR", "7", 55249071, "missense_variant", "p.Thr790Met", "C>T"),
    ("PIK3CA", "3", 178936091, "missense_variant", "p.Glu545Lys", "G>A"),
    ("IDH1", "2", 209113112, "missense_variant", "p.Arg132His", "C>T"),
    ("NF1", "17", 29553485, "frameshift_variant", "p.Leu847fs", "CT>C"),
    ("KRAS", "12", 25398284, "missense_variant", "p.Gly12Asp", "C>T"),
    ("ATRX", "X", 76938000, "stop_gained", "p.Gln119*", "G>A"),
    ("TERT", "5", 1295228, "upstream_gene_variant", "c.-124C>T", "G>A"),
    ("RB1", "13", 48941648, "splice_donor_variant", "c.1389+1G>A", "G>A"),
    ("CDKN2A", "9", 21971120, "stop_gained", "p.Arg80*", "G>A"),
    ("BRCA2", "13", 32914438, "frameshift_variant", "p.Ser1982fs", "AT>A"),
]
BASES = "ACGT"


def hex_to_int(color):
    return int(color.lstrip("#"), 16)


# --------------------------------------------------------------------------
# Patient designs: clones form a tree; each clone carries CN events and SNVs.
# Event: (chromosome, start_mb, end_mb, delta). delta > 0 gains the A allele,
# delta < 0 removes copies of the B allele first (so -1 on a diploid = LOH).
# --------------------------------------------------------------------------

PATIENTS = [
    {
        "id": "SC-PT01",
        "tumor_type": "GBM",
        "disease": "Glioblastoma",
        "primary_site": "brain",
        "write_tree": True,
        "drivers": {"trunk": ["TERT", "IDH1"], "A": ["ATRX"], "B": ["TP53"], "C": ["PTEN"]},
        "trunk": [("7", 0, 160, 1), ("10", 0, 136, -1), ("9", 19, 24, -1)],
        "clones": {
            "A": {"parent": None, "n": 12, "events": [("8", 50, 146, 1), ("13", 20, 60, -1)]},
            "B": {"parent": None, "n": 15, "events": [("17", 0, 22, -1), ("12", 55, 70, 4)],
                  "translocation": (("9", 133_600_000), ("22", 23_600_000))},
            "C": {"parent": "B", "n": 13, "events": [("1", 145, 249, 1), ("19", 0, 59, 1)]},
        },
    },
    {
        "id": "SC-PT02",
        "tumor_type": "BRCA",
        "disease": "Breast invasive carcinoma",
        "primary_site": "breast",
        "write_tree": False,
        "drivers": {"trunk": ["PIK3CA"], "A": ["BRCA2"], "B": ["TP53"]},
        "trunk": [("1", 145, 249, 1), ("16", 46, 90, -1), ("8", 120, 132, 3)],
        "clones": {
            "A": {"parent": None, "n": 14, "events": [("11", 60, 80, 2), ("17", 0, 22, -1)]},
            "B": {"parent": None, "n": 16, "events": [("20", 30, 63, 1), ("4", 0, 191, -1)]},
        },
    },
    {
        "id": "SC-PT03",
        "tumor_type": "LUAD",
        "disease": "Lung adenocarcinoma",
        "primary_site": "lung",
        "write_tree": False,
        "drivers": {"trunk": ["KRAS"], "A": ["CDKN2A"], "B": ["NF1"], "C": ["RB1"]},
        "trunk": [("12", 0, 35, 2), ("9", 0, 39, -1), ("3", 90, 198, 1)],
        "clones": {
            "A": {"parent": None, "n": 9, "events": [("5", 0, 50, 1)]},
            "B": {"parent": None, "n": 8, "events": [("18", 0, 78, -1), ("14", 30, 60, 1)]},
            "C": {"parent": "B", "n": 7, "events": [("6", 0, 60, 1), ("21", 0, 48, 1)]},
        },
        "cells_without_mutations": 2,
    },
]


def lineage(patient, clone):
    path = []
    while clone:
        path.append(clone)
        clone = patient["clones"][clone]["parent"]
    return list(reversed(path))


def random_snv(chromosome=None):
    chromosome = chromosome or rng.choice(list(CHROM_LEN))
    pos = rng.randrange(MB, CHROM_LEN[chromosome] - MB)
    ref = rng.choice(BASES)
    alt = rng.choice([b for b in BASES if b != ref])
    effect = rng.choice(["intergenic_region", "intron_variant", "intron_variant", "synonymous_variant",
                         "missense_variant", "downstream_gene_variant"])
    gene = f"LOC{rng.randrange(100000, 999999)}"
    return {"chromosome": chromosome, "position": pos, "gene": gene, "type": effect,
            "protein": "", "change": f"{ref}>{alt}"}


def driver_snv(name):
    gene, chromosome, pos, effect, protein, change = next(d for d in DRIVERS if d[0] == name)
    return {"chromosome": chromosome, "position": pos, "gene": gene, "type": effect,
            "protein": protein, "change": change}


def private_event():
    chromosome = rng.choice(list(CHROM_LEN))
    length = CHROM_LEN[chromosome] / MB
    start = rng.uniform(0, length * 0.7)
    end = min(length, start + rng.uniform(5, 40))
    return (chromosome, round(start), round(end), rng.choice([1, -1]))


# --------------------------------------------------------------------------
# Per-cell genome construction
# --------------------------------------------------------------------------

def cell_segments(events):
    """Per chromosome: list of (start, end, A, B) segments after applying events."""
    out = {}
    for chromosome, length in CHROM_LEN.items():
        cuts = {1, length + 1}
        for c, s, e, _ in events:
            if c == chromosome:
                cuts.add(max(1, int(s * MB) + 1))
                cuts.add(min(length + 1, int(e * MB) + 1))
        cuts = sorted(cuts)
        segs = []
        for s, e in zip(cuts[:-1], cuts[1:]):
            a, b = 1, 1
            for c, es, ee, delta in events:
                if c != chromosome or not (int(es * MB) + 1 <= s and e - 1 <= int(ee * MB)):
                    continue
                if delta > 0:
                    a += delta
                else:
                    for _ in range(-delta):
                        if b > 0:
                            b -= 1
                        elif a > 0:
                            a -= 1
            segs.append([s, e - 1, a, b])
        out[chromosome] = segs
    return out


def build_genome(segments, events, translocations):
    intervals = []
    by_chrom = {}
    for chromosome in CHROM_LEN:
        for s, e, a, b in segments[chromosome]:
            iid = len(intervals) + 1
            intervals.append({"chromosome": chromosome, "startPoint": s, "endPoint": e, "iid": iid,
                              "title": str(iid), "type": "interval", "y": a + b, "strand": "*"})
            by_chrom.setdefault(chromosome, []).append(intervals[-1])

    def first_at(chromosome, pos):
        return next((d for d in by_chrom[chromosome] if d["startPoint"] == pos), None)

    def last_at(chromosome, pos):
        return next((d for d in by_chrom[chromosome] if d["endPoint"] == pos), None)

    connections = []
    for chromosome, s, e, delta in events:
        if delta == 0:  # breakpoint-only marker (e.g. a translocation end)
            continue
        start = int(s * MB) + 1
        end = min(CHROM_LEN[chromosome], int(e * MB))
        if delta > 0:
            first, last = first_at(chromosome, start), last_at(chromosome, end)
            if first and last:  # tandem duplication: right end back to left end
                connections.append({"source": last["iid"], "sink": first["iid"],
                                    "title": "DUP-like", "weight": delta})
        else:
            before, after = last_at(chromosome, start - 1), first_at(chromosome, end + 1)
            if before and after:  # deletion: skip over the lost segment
                connections.append({"source": before["iid"], "sink": after["iid"],
                                    "title": "DEL-like", "weight": 1})
    for (c1, p1), (c2, p2) in translocations:
        left, right = last_at(c1, p1), last_at(c2, p2)
        if left and right:
            connections.append({"source": left["iid"], "sink": -right["iid"],
                                "title": "TRA-like", "weight": 1})
    for k, conn in enumerate(connections):
        conn.update({"cid": k + 1, "type": "ALT"})
    settings = {"y_axis": {"title": "copy number", "visible": True}, "y.axis": "cn",
                "description": "<h3>Single-cell genome graph (synthetic demo)</h3>"}
    return {"settings": settings, "intervals": intervals, "connections": connections}


def build_allelic(segments):
    intervals = []
    for chromosome in CHROM_LEN:
        for s, e, a, b in segments[chromosome]:
            for y, color in ((max(a, b), "#FF000080"), (min(a, b), "#0000FF80")):
                iid = len(intervals) + 1
                intervals.append({"chromosome": chromosome, "startPoint": s, "endPoint": e, "iid": iid,
                                  "y": y, "title": str(iid), "type": "interval", "strand": "*",
                                  "metadata": {"color": color}})
    return {"settings": {"y_axis": {"title": "copy number", "visible": True}, "y.axis": "cn"},
            "intervals": intervals, "connections": []}


def cn_at(segments, chromosome, pos):
    for s, e, a, b in segments[chromosome]:
        if s <= pos <= e:
            return a, b
    return 1, 1


def build_mutations(snvs, segments):
    intervals = []
    for k, v in enumerate(sorted(snvs, key=lambda d: (list(CHROM_LEN).index(d["chromosome"]), d["position"]))):
        a, b = cn_at(segments, v["chromosome"], v["position"])
        depth = max(2, int(rng.gauss(8 * (a + b) / 2, 3)))
        alt = max(1, min(depth, int(round(depth * rng.uniform(0.3, 0.8)))))
        annotation = (
            f"Type: {v['type']}; Gene: {v['gene']}; Variant: {v['protein'] or 'g.' + str(v['position']) + v['change']}; "
            f"Protein_variant: {v['protein']}; Genomic_variant: {v['change']}; VAF: {alt / depth:.3f}; "
            f"Alt_count: {alt}; Ref_count: {depth - alt}; Normal_alt_count: 0; Normal_ref_count: 30; Filter: PASS; "
        )
        intervals.append({"chromosome": v["chromosome"], "startPoint": v["position"],
                          "endPoint": v["position"] + 1, "iid": k + 1, "title": k + 1, "type": "interval",
                          "y": a + b, "annotation": annotation})
    return {"settings": {"y_axis": {"title": "copy number", "visible": True}},
            "intervals": intervals, "connections": []}


def build_coverage(segments, noise):
    xs, ys, colors = [], [], []
    for chromosome, length in CHROM_LEN.items():
        color = hex_to_int(CHROM_COLOR[chromosome])
        for start in range(1, length, COVERAGE_BIN):
            a, b = cn_at(segments, chromosome, start + COVERAGE_BIN // 2)
            reads = max(0.0, rng.gauss((a + b) * READS_PER_COPY, READS_PER_COPY * noise * max(1, (a + b) / 2)))
            xs.append(START_PLACE[chromosome] + start + COVERAGE_BIN // 2)
            ys.append(round(reads))
            colors.append(color)
    return {"x": xs, "y": ys, "color": colors}


def build_hetsnps(segments):
    xs, ys, colors = [], [], []
    for chromosome, length in CHROM_LEN.items():
        for pos in range(rng.randrange(1, 3 * MB), length, 3 * MB):
            a, b = cn_at(segments, chromosome, pos)
            for copies, color in ((max(a, b), 0xFF0000), (min(a, b), 0x0000FF)):
                xs.append(START_PLACE[chromosome] + pos)
                ys.append(max(0, round(rng.gauss(copies * HET_READS_PER_COPY, 2.5))))
                colors.append(color)
    return {"x": xs, "y": ys, "color": colors}


def newick_for(patient, cells_by_clone, snv_counts):
    def clone_newick(clone):
        children = [c for c, d in patient["clones"].items() if d["parent"] == clone]
        leaves = [f"{cell}:{rng.uniform(0.5, 2.5):.2f}" for cell in cells_by_clone[clone]]
        parts = leaves + [clone_newick(c) for c in children]
        return f"({','.join(parts)}){clone}:{snv_counts[clone]:.1f}"

    roots = [c for c, d in patient["clones"].items() if d["parent"] is None]
    return f"({','.join(clone_newick(c) for c in roots)})trunk:{snv_counts['trunk']:.1f};\n"


def write_json(path, payload):
    with open(path, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))


def main():
    manifest = []
    for patient in PATIENTS:
        pid = patient["id"]
        # Shared SNVs per lineage node.
        node_snvs = {"trunk": [driver_snv(g) for g in patient["drivers"].get("trunk", [])]
                     + [random_snv() for _ in range(18)]}
        for clone in patient["clones"]:
            node_snvs[clone] = [driver_snv(g) for g in patient["drivers"].get(clone, [])] + [
                random_snv() for _ in range(rng.randrange(8, 14))]
        cells_by_clone = {}
        cell_records = []
        n_without_mutations = patient.get("cells_without_mutations", 0)
        for clone, design in patient["clones"].items():
            path = lineage(patient, clone)
            events = list(patient["trunk"])
            translocations = []
            for node in path:
                events += patient["clones"][node]["events"]
                if patient["clones"][node].get("translocation"):
                    tra = patient["clones"][node]["translocation"]
                    translocations.append(tra)
                    # zero-delta events only add the breakpoints as segment ends
                    events += [(c, p / MB, p / MB, 0) for c, p in tra]
            for k in range(design["n"]):
                cell_id = f"{pid}-{clone}{k + 1:02d}"
                cells_by_clone.setdefault(clone, []).append(cell_id)
                cell_events = events + ([private_event()] if rng.random() < 0.3 else [])
                segments = cell_segments(cell_events)
                snvs = [v for node in ["trunk"] + path for v in node_snvs[node] if rng.random() < 0.6]
                snvs += [random_snv() for _ in range(rng.randrange(1, 4))]
                folder = os.path.join(DATA, cell_id)
                os.makedirs(folder, exist_ok=True)
                genome = build_genome(segments, cell_events, translocations)
                total = sum((d["endPoint"] - d["startPoint"] + 1) * d["y"] for d in genome["intervals"])
                ploidy = round(total / sum(CHROM_LEN.values()), 3)
                quality = round(rng.uniform(0.75, 0.99), 3)
                record = {
                    "pair": cell_id,
                    "entry_type": "cell",
                    "patient_id": pid,
                    "clone_id": clone,
                    "tumor_type": patient["tumor_type"],
                    "disease": patient["disease"],
                    "primary_site": patient["primary_site"],
                    "inferred_sex": "female",
                    "ploidy": ploidy,
                    "quality": quality,
                    "total_reads": int(rng.uniform(0.6, 2.4) * 1e6),
                    "snv_count": len(snvs),
                    "junction_count": len(genome["connections"]),
                    "summary": f"Single cell · clone {clone} · ploidy {ploidy}",
                }
                metadata = {**record, "cov_slope": 1 / READS_PER_COPY, "cov_intercept": 0,
                            "hets_slope": 1 / HET_READS_PER_COPY, "hets_intercept": 0}
                write_json(os.path.join(folder, "metadata.json"), [metadata])
                write_json(os.path.join(folder, "complex.json"), genome)
                write_json(os.path.join(folder, "allelic.json"), build_allelic(segments))
                if len(cell_records) >= n_without_mutations:
                    write_json(os.path.join(folder, "mutations.json"), build_mutations(snvs, segments))
                elif os.path.exists(os.path.join(folder, "mutations.json")):
                    os.remove(os.path.join(folder, "mutations.json"))
                write_table(os.path.join(folder, "coverage.arrow"),
                            build_coverage(segments, noise=rng.uniform(0.08, 0.2)))
                write_table(os.path.join(folder, "hetsnps.arrow"), build_hetsnps(segments))
                cell_records.append(record)

        folder = os.path.join(DATA, pid)
        os.makedirs(folder, exist_ok=True)
        clone_list = ", ".join(f"{c} ({len(v)} cells)" for c, v in cells_by_clone.items())
        patient_record = {
            "pair": pid,
            "entry_type": "patient",
            "patient_id": pid,
            "tumor_type": patient["tumor_type"],
            "disease": patient["disease"],
            "primary_site": patient["primary_site"],
            "inferred_sex": "female",
            "cell_count": len(cell_records),
            "summary": f"Single-cell WGS patient\nCells: {len(cell_records)}\nClones: {clone_list}",
        }
        write_json(os.path.join(folder, "metadata.json"), [patient_record])
        tree_path = os.path.join(folder, "tree.nwk")
        if patient["write_tree"]:
            counts = {k: float(len(v)) for k, v in node_snvs.items()}
            with open(tree_path, "w") as fh:
                fh.write(newick_for(patient, cells_by_clone, counts))
        elif os.path.exists(tree_path):
            os.remove(tree_path)
        manifest.append(patient_record)
        manifest.extend(cell_records)

    write_json(os.path.join(ROOT, "datafiles_sc.json"), manifest)

    datasets_path = os.path.join(ROOT, "datasets.json")
    with open(datasets_path) as fh:
        datasets = json.load(fh)
    datasets = [d for d in datasets if d.get("id") != DATASET_ID] + [{
        "id": DATASET_ID,
        "title": "DEMO Single-Cell Dataset",
        "datafilesPath": "datafiles_sc.json",
        "commonPath": "common/",
        "dataPath": "data/",
        "reference": "hg19",
    }]
    with open(datasets_path, "w") as fh:
        json.dump(datasets, fh, indent=2)
        fh.write("\n")
    n_cells = sum(1 for r in manifest if r["entry_type"] == "cell")
    print(f"wrote {len(PATIENTS)} patients and {n_cells} cells")


if __name__ == "__main__":
    main()
