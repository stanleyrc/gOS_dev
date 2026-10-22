#!/usr/bin/env python3
"""Build gene_summaries.tsv: one function paragraph per human gene for the gOS gene popovers.

Source per gene, first available wins (the text is copied verbatim from that source):
  1. OncoKB   - the gene's OncoKB "summary" sentence + "background" paragraph, taken from the
                all_curated_genes.tsv that gOS already serves in common/ (no new OncoKB text is
                downloaded; licence: OncoKB text only where gOS already uses it).
  2. NCBI     - the RefSeq / Entrez Gene summary (E-utilities esummary db=gene, no API key,
                <= 3 requests/s).
  3. UniProt  - the reviewed (Swiss-Prot) human entry's "Function" comment (REST stream, TSV
                cc_function); only the "FUNCTION: " prefix and {ECO:...} evidence tags are removed.
  otherwise     "not available (no summary in NCBI/UniProt)" with source "none".

Genes covered: every NCBI human protein-coding gene (Homo_sapiens.gene_info) plus every gene
symbol found in the gOS data files given with --data (rna/genes.tsv, rna/splicing.json,
rna/fusions.json, rna/markers.json, _cohort/rna_covariate_de.json, _cohort/rna/splicing.json).
Symbols are matched to NCBI Gene IDs by official symbol, then by a unique synonym.

Usage:
  python3 build_gene_summaries.py --out <dir> --curated <gOS_common>/all_curated_genes.tsv \
      --data <gOS data root> [--cache <dir>]
Writes <out>/gene_summaries.tsv, gene_summaries.tsv.gz, gene_summaries_manifest.json (sources,
URLs, download date, coverage) and README.md.
"""
import argparse
import csv
import datetime as dt
import glob
import gzip
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

GENE_INFO_URL = "https://ftp.ncbi.nlm.nih.gov/gene/DATA/GENE_INFO/Mammalia/Homo_sapiens.gene_info.gz"
ESUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
UNIPROT_URL = (
    "https://rest.uniprot.org/uniprotkb/stream?format=tsv"
    "&fields=accession,gene_primary,xref_geneid,cc_function"
    "&query=" + urllib.parse.quote("(organism_id:9606) AND (reviewed:true)")
)
NOT_AVAILABLE = "not available (no summary in NCBI/UniProt)"
COLUMNS = [
    "symbol", "entrez_id", "ensembl_id", "name", "gene_type", "summary", "source", "url",
    "oncokb_oncogene", "oncokb_tsg", "oncokb_level", "in_data",
]
UA = {"User-Agent": "gOS-gene-summaries/1.0 (single-cell GBM; mskilab)"}


def fetch(url, data=None, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - retry any transport error
            if i == tries - 1:
                raise
            print(f"retry {i + 1} {url[:80]}: {e}", file=sys.stderr)
            time.sleep(2 * (i + 1))
    return b""


def cached(cache, name, url):
    path = os.path.join(cache, name)
    if not os.path.exists(path):
        print(f"download {url}", file=sys.stderr)
        tmp = path + ".part"
        with open(tmp, "wb") as f:
            f.write(fetch(url))
        os.replace(tmp, path)
    return path


# ---------- parsers (pure; unit tested) ----------

def parse_gene_info(lines):
    """NCBI gene_info rows -> list of dicts (symbol, entrez, synonyms, ensembl, name, type)."""
    out = []
    head = None
    for line in lines:
        if line.startswith("#"):
            head = line.lstrip("#").rstrip("\n").split("\t")
            continue
        f = line.rstrip("\n").split("\t")
        if head is None or len(f) < len(head):
            continue
        r = dict(zip(head, f))
        xrefs = r.get("dbXrefs", "-").split("|")
        ens = next((x.split(":", 1)[1] for x in xrefs if x.startswith("Ensembl:")), "")
        syn = [s for s in r.get("Synonyms", "-").split("|") if s and s != "-"]
        out.append({
            "symbol": r["Symbol"], "entrez": r["GeneID"], "synonyms": syn, "ensembl": ens,
            "name": r.get("description", "") if r.get("description", "-") != "-" else "",
            "type": r.get("type_of_gene", ""),
        })
    return out


ECO = re.compile(r"\s*\{ECO:[^}]*\}")
PUBMED_REF = re.compile(r"\s*\(PubMed:[0-9, ]+\)")


def clean_uniprot_function(text):
    """'FUNCTION: X. {ECO:...}. FUNCTION: Y.' -> 'X. Y.' (prefix and evidence tags removed only)."""
    if not text:
        return ""
    parts = [p.strip() for p in re.split(r"FUNCTION:\s*", text) if p.strip()]
    parts = [ECO.sub("", p).strip() for p in parts]
    parts = [re.sub(r"\s*\.\s*\.$", ".", p) for p in parts]
    parts = [re.sub(r"\s+\.$", ".", p) for p in parts]
    return " ".join(p for p in parts if p).strip()


def parse_uniprot_tsv(text):
    """UniProt TSV (Entry, Gene Names (primary), GeneID, Function [CC]) -> (by_entrez, by_symbol)."""
    by_id, by_sym = {}, {}
    rdr = csv.reader(io.StringIO(text), delimiter="\t")
    head = next(rdr, None)
    if not head:
        return by_id, by_sym
    for f in rdr:
        if len(f) < 4:
            continue
        acc, sym, gids, func = f[0], f[1].split(";")[0].strip(), f[2], clean_uniprot_function(f[3])
        if not func:
            continue
        rec = {"accession": acc, "text": func}
        for g in [g.strip() for g in gids.split(";") if g.strip()]:
            by_id.setdefault(g, rec)
        if sym:
            by_sym.setdefault(sym, rec)
    return by_id, by_sym


def parse_curated(text):
    """gOS common/all_curated_genes.tsv (OncoKB) -> {symbol: {...}}. The header names 11 columns but
    rows carry 12: 'Summary_Background' spans the summary sentence and the background paragraph."""
    lines = [l for l in text.split("\n") if l.strip()]
    if not lines:
        return {}
    head = lines[0].rstrip("\r").split("\t")
    ix = {h: i for i, h in enumerate(head)}
    i_sum = ix.get("Summary_Background", len(head) - 1)
    out = {}
    for l in lines[1:]:
        f = l.rstrip("\r").split("\t")
        sym = f[ix["Hugo_Symbol"]] if len(f) > ix["Hugo_Symbol"] else ""
        if not sym:
            continue
        text = " ".join(x.strip() for x in f[i_sum:] if x.strip())
        lev = [f[ix[k]] for k in ("Highest_Level_of_Evidence_sensitivity", "Highest_Level_of_Evidence_resistance") if k in ix and len(f) > ix[k] and f[ix[k]]]
        out[sym] = {
            "text": text,
            "entrez": f[ix["Entrez_Gene_ID"]] if "Entrez_Gene_ID" in ix else "",
            "oncogene": f[ix["Is_Oncogene"]].lower() == "yes" if "Is_Oncogene" in ix else False,
            "tsg": f[ix["Is_Tumor_Suppressor_Gene"]].lower() == "yes" if "Is_Tumor_Suppressor_Gene" in ix else False,
            "level": "/".join(lev),
        }
    return out


GENE_KEY = re.compile(r"^(gene|gene[12]|genes|event_gene|symbol|gene_a|gene_b|partner_genes?)$", re.I)
SYMBOL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._@-]{0,30}$")


def collect_symbols(obj, acc):
    """Every string under a gene-like key (gene, gene1/2, genes, event_gene, ...) of a JSON object."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if GENE_KEY.match(str(k)):
                vals = v if isinstance(v, list) else [v]
                for x in vals:
                    if isinstance(x, str):
                        for s in re.split(r"[,;/|]|::", x):
                            s = s.strip()
                            if SYMBOL.match(s) and s not in ("NA", "-", "none", "None"):
                                acc.add(s)
                    else:
                        collect_symbols(x, acc)
            else:
                collect_symbols(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            collect_symbols(v, acc)


def choose(sym, entrez, curated, ncbi, uni_id, uni_sym):
    """Source chain for one gene -> (summary, source, url)."""
    c = curated.get(sym)
    if c and c["text"]:
        return c["text"], "OncoKB", f"https://www.oncokb.org/gene/{urllib.parse.quote(sym)}"
    n = ncbi.get(entrez) if entrez else None
    if n and n.get("summary"):
        return n["summary"], "NCBI Gene (RefSeq)", f"https://www.ncbi.nlm.nih.gov/gene/{entrez}"
    u = (uni_id.get(entrez) if entrez else None) or uni_sym.get(sym)
    if u:
        return u["text"], "UniProt", f"https://www.uniprot.org/uniprotkb/{u['accession']}/entry"
    return NOT_AVAILABLE, "none", ""


# ---------- build ----------

def data_symbols(root):
    """Symbols per category from the gOS data root."""
    cats = {"expressed": set(), "splicing": set(), "fusion": set(), "de": set()}
    for p in glob.glob(os.path.join(root, "*", "rna", "genes.tsv")):
        with open(p) as f:
            for line in f:
                s = line.strip().split("\t")[0]
                if s and SYMBOL.match(s):
                    cats["expressed"].add(s)
    jobs = [("splicing", "*/rna/splicing.json"), ("splicing", "_cohort/rna/splicing.json"),
            ("fusion", "*/rna/fusions.json"), ("de", "*/rna/markers.json"),
            ("de", "_cohort/rna_covariate_de.json"), ("de", "_cohort/rna/markers.json")]
    for cat, pat in jobs:
        for p in glob.glob(os.path.join(root, pat)):
            try:
                with open(p) as f:
                    collect_symbols(json.load(f), cats[cat])
            except Exception as e:  # noqa: BLE001
                print(f"skip {p}: {e}", file=sys.stderr)
    return cats


def ncbi_summaries(ids, cache, batch=300):
    path = os.path.join(cache, "ncbi_esummary.jsonl")
    have = {}
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                r = json.loads(line)
                have[r["uid"]] = r
    todo = sorted(set(ids) - set(have), key=lambda x: int(x) if x.isdigit() else 0)
    with open(path, "a") as out:
        for i in range(0, len(todo), batch):
            chunk = todo[i:i + batch]
            body = urllib.parse.urlencode({"db": "gene", "retmode": "json", "id": ",".join(chunk)}).encode()
            res = json.loads(fetch(ESUMMARY_URL, data=body)).get("result", {})
            for uid in res.get("uids", []):
                r = res[uid]
                rec = {"uid": uid, "name": r.get("name", ""), "description": r.get("description", ""), "summary": (r.get("summary") or "").strip()}
                have[uid] = rec
                out.write(json.dumps(rec) + "\n")
            out.flush()
            print(f"esummary {min(i + batch, len(todo))}/{len(todo)}", file=sys.stderr)
            time.sleep(0.4)  # stay under the 3 requests/s key-free limit
    return have


def write_readme(path, m):
    cov = m["coverage"]
    lines = [
        "# gene_summaries.tsv", "",
        f"Built {m['built']} by `{m['script']}` (gOS_dev). One row per gene; columns: " + ", ".join(f"`{c}`" for c in COLUMNS) + ".", "",
        "Each `summary` is copied verbatim from the source named in `source` (link in `url`); the first available wins:",
        "1. **OncoKB**: summary sentence + background paragraph from the gOS common/all_curated_genes.tsv already served by gOS (no other OncoKB text is used).",
        "2. **NCBI Gene (RefSeq)**: the Entrez Gene summary (RefSeq / Alliance of Genome Resources text, with its own `[provided by ...]` attribution).",
        "3. **UniProt**: the reviewed human entry's Function comment; only the `FUNCTION:` prefix and `{ECO:...}` evidence tags are removed.",
        f"4. otherwise `{NOT_AVAILABLE}` with source `none`.", "",
        "## Sources and download dates", "",
    ]
    for name, v in m["sources"].items():
        lines.append(f"- {name}: {v.get('url') or v.get('path')}" + (f" (downloaded {v['downloaded']})" if v.get("downloaded") else ""))
    lines += ["", "Raw downloads are kept in `raw/` next to the build (not promoted).", "", "## Coverage (genes with a summary)", "",
              "| set | genes | with summary | OncoKB | NCBI | UniProt |", "|---|---|---|---|---|---|"]
    for k, v in cov.items():
        b = v["by_source"]
        lines.append(f"| {k} | {v['genes']} | {v['pct_with_summary']}% | {b.get('OncoKB', 0)} | {b.get('NCBI Gene (RefSeq)', 0)} | {b.get('UniProt', 0)} |")
    lines += ["", "Gene universe: NCBI human protein-coding genes plus every gene symbol in the gOS RNA files (rna/genes.tsv, rna/splicing.json, rna/fusions.json, rna/markers.json, _cohort/rna_covariate_de.json, _cohort/rna/splicing.json). `in_data` lists the sets a gene appears in.", ""]
    with open(path, "w") as f:
        f.write("\n".join(lines))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--curated", required=True, help="gOS common/all_curated_genes.tsv (OncoKB)")
    ap.add_argument("--data", required=True, help="gOS data root (patient folders + _cohort)")
    ap.add_argument("--cache", help="download cache (default <out>/raw)")
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    cache = a.cache or os.path.join(a.out, "raw")
    os.makedirs(cache, exist_ok=True)
    today = dt.date.today().isoformat()

    gi_path = cached(cache, "Homo_sapiens.gene_info.gz", GENE_INFO_URL)
    with gzip.open(gi_path, "rt") as f:
        genes = parse_gene_info(f)
    by_sym = {g["symbol"]: g for g in genes}
    syn = {}
    for g in genes:
        for s in g["synonyms"]:
            syn.setdefault(s, set()).add(g["symbol"])

    with open(a.curated) as f:
        curated = parse_curated(f.read())

    cats = data_symbols(a.data)
    in_data = set().union(*cats.values())

    universe = {g["symbol"] for g in genes if g["type"] == "protein-coding"} | in_data | set(curated)
    rows = {}
    for s in sorted(universe):
        g = by_sym.get(s)
        if g is None and len(syn.get(s, ())) == 1:
            g = by_sym[next(iter(syn[s]))]
        rows[s] = g

    uni_path = cached(cache, "uniprot_human_reviewed_function.tsv", UNIPROT_URL)
    with open(uni_path) as f:
        uni_id, uni_sym = parse_uniprot_tsv(f.read())

    ids = {g["entrez"] for g in rows.values() if g}
    ncbi = ncbi_summaries(ids, cache)

    out_rows = []
    for s, g in rows.items():
        entrez = g["entrez"] if g else curated.get(s, {}).get("entrez", "")
        summary, source, url = choose(s, entrez, curated, ncbi, uni_id, uni_sym)
        c = curated.get(s, {})
        cat = [k for k in ("splicing", "de", "fusion", "expressed") if s in cats[k]]
        out_rows.append({
            "symbol": s, "entrez_id": entrez or "", "ensembl_id": g["ensembl"] if g else "",
            "name": (g["name"] if g else "") or (ncbi.get(entrez, {}).get("description", "") if entrez else ""),
            "gene_type": g["type"] if g else "",
            "summary": re.sub(r"\s+", " ", summary).strip(), "source": source, "url": url,
            "oncokb_oncogene": "yes" if c.get("oncogene") else "", "oncokb_tsg": "yes" if c.get("tsg") else "",
            "oncokb_level": c.get("level", ""), "in_data": ",".join(cat),
        })

    tsv = os.path.join(a.out, "gene_summaries.tsv")
    with open(tsv, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, delimiter="\t", quoting=csv.QUOTE_NONE, escapechar="\\", lineterminator="\n")
        w.writeheader()
        for r in out_rows:
            w.writerow({k: str(v).replace("\t", " ").replace("\n", " ") for k, v in r.items()})
    with open(tsv, "rb") as fi, gzip.open(tsv + ".gz", "wb", compresslevel=9) as fo:
        fo.write(fi.read())

    def coverage(syms):
        n = len(syms)
        src = {}
        for r in out_rows:
            if r["symbol"] in syms:
                src[r["source"]] = src.get(r["source"], 0) + 1
        have = n - src.get("none", 0)
        return {"genes": n, "with_summary": have, "pct_with_summary": round(100 * have / n, 1) if n else None,
                "by_source": dict(sorted(src.items(), key=lambda kv: -kv[1]))}

    pc = {r["symbol"] for r in out_rows if r["gene_type"] == "protein-coding"}
    manifest = {
        "built": today, "script": "gOS_dev scripts/singleCell/build_gene_summaries.py",
        "sources": {
            "NCBI gene_info": {"url": GENE_INFO_URL, "downloaded": dt.date.fromtimestamp(os.path.getmtime(gi_path)).isoformat()},
            "NCBI E-utilities esummary (db=gene)": {"url": ESUMMARY_URL, "downloaded": today},
            "UniProt reviewed human, cc_function": {"url": UNIPROT_URL, "downloaded": dt.date.fromtimestamp(os.path.getmtime(uni_path)).isoformat()},
            "OncoKB (gOS common/all_curated_genes.tsv)": {"path": os.path.abspath(a.curated)},
        },
        "rows": len(out_rows),
        "coverage": {"all": coverage({r["symbol"] for r in out_rows}), "protein_coding": coverage(pc),
                     "splicing": coverage(cats["splicing"]), "de_markers_covariate": coverage(cats["de"]),
                     "fusion": coverage(cats["fusion"]), "expressed_rna": coverage(cats["expressed"])},
    }
    with open(os.path.join(a.out, "gene_summaries_manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    write_readme(os.path.join(a.out, "README.md"), manifest)
    print(json.dumps(manifest["coverage"], indent=1))


if __name__ == "__main__":
    main()
