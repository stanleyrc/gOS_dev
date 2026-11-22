#!/usr/bin/env python3
"""Add-only report metadata for the gOS home page: data_type, patient, canonical.

  build  datasets.json + config.json -> patch.json (+ a TSV table for review)
  apply  patch.json -> patched COPIES of datasets.json and each datafiles JSON

The config (kept outside git, next to the data) names the per-dataset data
types and any per-report overrides:

  {
    "web_prefix": {"https://host/user/": "/local/web/root/"},
    "datasets": {"<id>": {"data_type": ["bulk_wgs"], "reason": "..."}},
    "reports":  {"<id>": {"<report>": {"data_type": [...], "patient": "...", "reason": "..."}}},
    "canonical": {"<id>": {"from": "<datafiles of the one-per-patient set>",
                           "choose": {"<patient>": "<report>"}}}
  }

Rules (documented in the README the patch ships with):
  * a report's types = its override, else its dataset's types;
  * single-cell DNA reports gain "sc_dna_rna" when any of their cells has RNA
    (has_rna true or an rna_id);
  * patient = override, else the report name up to its first "_";
  * canonical: true for the report of each patient listed in the "from"
    datafiles (ties resolved by "choose"); every other report gets no flag and
    the app's rule applies (un-suffixed name, fewest suffixes, newest export).

apply never overwrites a value that is already present (it reports the
conflict instead), and writes only to --out-dir.
"""
import argparse
import collections
import csv
import json
import os
import sys


def load(path):
    with open(path) as f:
        return json.load(f)


def local_path(url_or_path, base_dir, prefixes):
    for url, root in (prefixes or {}).items():
        if url_or_path.startswith(url):
            return os.path.join(root, url_or_path[len(url):])
    return url_or_path if os.path.isabs(url_or_path) else os.path.join(base_dir, url_or_path)


def entry_type(r):
    return r.get("entry_type") or r.get("entryType")


def name_of(r):
    return str(r.get("caseReportId") or r.get("pair") or r.get("case_id") or r.get("id") or "")


def build(args):
    datasets = load(args.datasets)
    cfg = load(args.config)
    base = os.path.dirname(os.path.abspath(args.datasets))
    prefixes = cfg.get("web_prefix", {})
    patch = {"datasets": {}, "reports": {}}
    rows = []
    for ds in datasets:
        did = ds["id"]
        dcfg = cfg.get("datasets", {}).get(did)
        dtypes = (dcfg or {}).get("data_type") or ["unknown"]
        patch["datasets"][did] = {"data_type": dtypes}
        path = local_path(ds["datafilesPath"], base, prefixes)
        if not os.path.exists(path):
            print(f"[skip] {did}: datafiles not found at {path}", file=sys.stderr)
            continue
        records = load(path)
        rna = collections.Counter()
        for r in records:
            if entry_type(r) == "cell" and (r.get("has_rna") is True or r.get("rna_id")):
                rna[str(r.get("patient_id"))] += 1
        reports = [r for r in records if entry_type(r) != "cell" and r.get("visible") is not False]
        rcfg = cfg.get("reports", {}).get(did, {})
        canon_cfg = cfg.get("canonical", {}).get(did) or cfg.get("canonical", {}).get("*")
        canon = set()
        if canon_cfg:
            clean = load(local_path(canon_cfg["from"], base, prefixes))
            by_patient = collections.defaultdict(list)
            for r in clean:
                if entry_type(r) == "patient":
                    n = name_of(r)
                    by_patient[(rcfg.get(n, {}).get("patient") or n.split("_")[0])].append(n)
            for p, names in by_patient.items():
                pick = canon_cfg.get("choose", {}).get(p)
                canon.add(pick if pick else names[0]) if (pick or len(names) == 1) else None
        out = {}
        for r in reports:
            n = name_of(r)
            o = rcfg.get(n, {})
            types = list(o.get("data_type") or dtypes)
            is_sc = entry_type(r) == "patient"
            if is_sc and any(t in types for t in ("sc_dna_pta", "sc_dna_lowpass")) and rna.get(n, 0) > 0 and "sc_dna_rna" not in types and not o.get("no_auto_rna"):
                types.append("sc_dna_rna")
            if not is_sc and not o:
                continue  # bulk reports: the dataset type is enough
            entry = {"data_type": types, "patient": o.get("patient") or n.split("_")[0]}
            if n in canon:
                entry["canonical"] = True
            out[n] = entry
            rows.append([did, n, entry["patient"], ",".join(types), "yes" if n in canon else "", rna.get(n, 0), o.get("reason", "")])
        if out:
            patch["reports"][did] = out
    with open(args.out, "w") as f:
        json.dump(patch, f, indent=1)
    if args.table:
        with open(args.table, "w", newline="") as f:
            w = csv.writer(f, delimiter="\t")
            w.writerow(["dataset", "report", "patient", "data_type", "canonical", "rna_cells", "reason"])
            w.writerows(rows)
    print(f"wrote {args.out}: {len(patch['datasets'])} datasets, {sum(len(v) for v in patch['reports'].values())} reports")


def add_only(target, values, where, conflicts):
    changed = False
    for k, v in values.items():
        if k in target and target[k] not in (None, "", []):
            if target[k] != v:
                conflicts.append(f"{where}.{k}: kept {target[k]!r}, patch has {v!r}")
            continue
        target[k] = v
        changed = True
    return changed


def apply(args):
    datasets = load(args.datasets)
    patch = load(args.patch)
    cfg = load(args.config) if args.config else {}
    base = os.path.dirname(os.path.abspath(args.datasets))
    prefixes = cfg.get("web_prefix", {})
    os.makedirs(args.out_dir, exist_ok=True)
    conflicts = []
    for ds in datasets:
        did = ds["id"]
        add_only(ds, patch["datasets"].get(did, {}), f"datasets[{did}]", conflicts)
        reports = patch["reports"].get(did)
        if not reports:
            continue
        src = local_path(ds["datafilesPath"], base, prefixes)
        records = load(src)
        n_changed = 0
        for r in records:
            if entry_type(r) == "cell":
                continue
            vals = reports.get(name_of(r))
            if vals and add_only(r, vals, f"{did}/{name_of(r)}", conflicts):
                n_changed += 1
        dst = os.path.join(args.out_dir, f"{did}.datafiles.json")
        with open(dst, "w") as f:
            json.dump(records, f, separators=(",", ":"))
        if args.rewrite_paths:
            ds["datafilesPath"] = os.path.join(args.rewrite_paths, os.path.basename(dst))
        print(f"{did}: {n_changed} reports patched -> {dst}")
    with open(os.path.join(args.out_dir, "datasets.json"), "w") as f:
        json.dump(datasets, f, indent=2)
    for c in conflicts:
        print("[conflict, kept existing]", c)
    print(f"wrote {os.path.join(args.out_dir, 'datasets.json')}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--datasets", required=True)
    b.add_argument("--config", required=True)
    b.add_argument("--out", required=True)
    b.add_argument("--table")
    a = sub.add_parser("apply")
    a.add_argument("--datasets", required=True)
    a.add_argument("--patch", required=True)
    a.add_argument("--config")
    a.add_argument("--out-dir", required=True)
    a.add_argument("--rewrite-paths", help="point datafilesPath of patched datasets at <this>/<id>.datafiles.json (preview copies)")
    args = ap.parse_args()
    build(args) if args.cmd == "build" else apply(args)


if __name__ == "__main__":
    main()
