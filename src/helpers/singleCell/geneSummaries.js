// Gene function summaries for every gene name gOS lists (splicing, DE, fusions, breakpoint
// transcripts): parser and text helpers for common/gene_summaries.tsv(.gz), built by
// scripts/singleCell/build_gene_summaries.py (OncoKB > NCBI RefSeq > UniProt, text copied
// verbatim with its source). d3-free so it can be unit tested; the loader takes fetch /
// gunzip as arguments.

export const GENE_SUMMARY_FILE = "gene_summaries.tsv";
export const NOT_AVAILABLE = "not available (no summary in NCBI/UniProt)";

/** gene_summaries.tsv text -> Map(symbol -> record); null when the text is not that table (e.g. an HTML fallback page). */
export function parseGeneSummaries(text) {
  const lines = `${text || ""}`.split(/\r?\n/);
  const head = (lines[0] || "").split("\t");
  const at = (name) => head.indexOf(name);
  const iSym = at("symbol");
  const iSum = at("summary");
  if (iSym < 0 || iSum < 0) return null;
  const cols = {
    entrez: at("entrez_id"),
    ensembl: at("ensembl_id"),
    name: at("name"),
    type: at("gene_type"),
    source: at("source"),
    url: at("url"),
    oncogene: at("oncokb_oncogene"),
    tsg: at("oncokb_tsg"),
    level: at("oncokb_level"),
  };
  const map = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split("\t");
    const symbol = f[iSym];
    if (!symbol) continue;
    const get = (j) => (j >= 0 && f[j] ? f[j].replace(/\\(.)/g, "$1") : "");
    const source = get(cols.source);
    const summary = get(iSum);
    map.set(symbol, {
      symbol,
      entrez: get(cols.entrez),
      ensembl: get(cols.ensembl),
      name: get(cols.name),
      type: get(cols.type),
      summary: source === "none" ? "" : summary,
      source: source === "none" ? "" : source,
      url: get(cols.url),
      oncogene: get(cols.oncogene) === "yes",
      tsg: get(cols.tsg) === "yes",
      level: get(cols.level),
    });
  }
  return map;
}

/** Record for a gene name as gOS shows it ("GENE", "gene", "GENE(1234)", "GENE,OTHER"); null when absent. */
export function lookupGene(map, gene) {
  if (!map || !gene) return null;
  const raw = `${gene}`.trim();
  if (map.has(raw)) return map.get(raw);
  const first = raw.split(/[,;(]|::/)[0].trim();
  if (map.has(first)) return map.get(first);
  const up = first.toUpperCase();
  return map.get(up) || null;
}

/** First ~n characters of a summary, cut at a word boundary; { text, truncated }. */
export function summarySnippet(summary, n = 300) {
  const s = `${summary || ""}`.trim();
  if (s.length <= n) return { text: s, truncated: false };
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return { text: `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, "")}…`, truncated: true };
}

/**
 * One-line function snippet for tables: the first sentence (OncoKB's summary sentence, or the
 * first sentence of the NCBI / UniProt text), at most n characters. "" when there is no summary.
 */
export function functionLine(rec, n = 120) {
  const s = `${rec?.summary || ""}`.trim();
  if (!s) return "";
  // first sentence: a full stop followed by a space and a capital / digit, not inside "e.g." etc.
  const m = s.match(/^(.{20,}?[a-z0-9)\]][.;])\s+(?=[A-Z0-9(])/);
  const first = m ? m[1] : s;
  return summarySnippet(first, n).text;
}

/** Badges for a record: OncoKB oncogene / TSG / highest level. */
export function geneBadges(rec) {
  if (!rec) return [];
  const out = [];
  if (rec.oncogene) out.push({ key: "onc", label: "Oncogene", color: "red", title: "OncoKB: oncogene" });
  if (rec.tsg) out.push({ key: "tsg", label: "TSG", color: "blue", title: "OncoKB: tumor suppressor gene" });
  if (rec.level) out.push({ key: "lvl", label: `OncoKB L${rec.level.replace(/\//g, " / ")}`, color: "volcano", title: "OncoKB highest level of evidence (sensitivity / resistance)" });
  return out;
}

/** External pages for a record (or a bare symbol). */
export function geneInfoLinks(symbol, rec = null) {
  const s = encodeURIComponent(symbol);
  return [
    { label: "GeneCards", href: `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${s}` },
    { label: "NCBI Gene", href: rec?.entrez ? `https://www.ncbi.nlm.nih.gov/gene/${rec.entrez}` : `https://www.ncbi.nlm.nih.gov/gene/?term=${s}%5Bsym%5D+AND+human%5Borgn%5D` },
    { label: "UniProt", href: `https://www.uniprot.org/uniprotkb?query=gene_exact:${s}+AND+organism_id:9606+AND+reviewed:true` },
    { label: "OncoKB", href: `https://www.oncokb.org/gene/${s}` },
  ];
}

const isGzip = (buf) => {
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  return b.length === 2 && b[0] === 0x1f && b[1] === 0x8b;
};

/**
 * Load common/gene_summaries.tsv: the .gz first (gunzipped in the browser; a server that sets
 * Content-Encoding hands back plain text), then the plain file. Resolves to
 * { map } or { error } (never rejects), so callers can show "not available (reason)".
 */
export async function loadGeneSummaries(commonPath, { fetchImpl, gunzip } = {}) {
  const base = `${commonPath || "common/"}${GENE_SUMMARY_FILE}`;
  const errors = [];
  const tryUrl = async (url, gz) => {
    const r = await fetchImpl(url);
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    let text;
    if (gz && isGzip(buf)) {
      text = gunzip ? await gunzip(buf) : null;
      if (text == null) throw new Error("browser cannot gunzip");
    } else text = new TextDecoder().decode(buf);
    const map = parseGeneSummaries(text);
    if (!map) throw new Error(`${url} is not a gene summary table`);
    return map;
  };
  for (const [url, gz] of [[`${base}.gz`, true], [base, false]]) {
    try {
      return { map: await tryUrl(url, gz) };
    } catch (e) {
      errors.push(e.message);
    }
  }
  return { error: errors.join("; ") };
}
