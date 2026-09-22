// Report-only formatting. Source annotations and stored events remain unchanged.
export function formatMyeloSeqSampleId(value) {
  const id = String(value ?? "");
  const accession = id.match(/^TM\d{2}-\d{3}-\d{4}(?=$|[-_])/);
  if (!accession) return id;
  const accessions = Array.from(id.matchAll(/(?:^|_)(TM\d{2}-\d{3}-\d{4})(?=$|[-_])/g));
  return accessions.every((match) => match[1] === accession[0]) ? accession[0] : id;
}

export function formatMyeloSeqComments(value) {
  // Only the first, leading CSV source tag is metadata; later brackets may be
  // citations or clinically meaningful annotations and must remain untouched.
  return String(value ?? "").replace(/^\s*\[[^[\]\r\n]*\.csv\]\s*/, "");
}

export function getMyeloSeqVariantType(finding) {
  const suppliedType = String(finding?.variant_type ?? "").trim();
  return (suppliedType || String(finding?.type ?? "").trim()).toUpperCase();
}

export function isMyeloSeqFusion(finding) {
  if (String(finding?.variant_type ?? "").trim()) {
    return getMyeloSeqVariantType(finding) === "FUSION";
  }
  return /fusion/i.test(`${finding?.eventType || ""} ${finding?.type || ""}`);
}

function isFlt3Indel(finding) {
  const gene = String(finding?.gene ?? finding?.Gene ?? "").trim().toUpperCase();
  return gene === "FLT3" && ["INDEL", "FLT3ITD"].includes(getMyeloSeqVariantType(finding));
}

function sourceVariant(finding) {
  return String(finding?.sourceVariant ?? finding?.Variant ?? finding?.variant ?? "");
}

function getFlt3Duplication(finding) {
  if (!isFlt3Indel(finding)) return undefined;
  const range = sourceVariant(finding).match(/\bc\.(\d+)(?:_(\d+))?dup([ACGTRYSWKMBDHVN]*)(?=$|[\s,/])/i);
  if (!range) return undefined;
  const start = Number(range[1]);
  const end = Number(range[2] || range[1]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end < start) {
    return undefined;
  }
  return {
    coding: `c.${range[1]}${range[2] ? `_${range[2]}` : ""}dup`,
    end,
    size: end - start + 1,
    sequenceMatchesRange: !range[3] || range[3].length === end - start + 1,
  };
}

export function getMyeloSeqInsertionSize(finding) {
  return getFlt3Duplication(finding)?.size;
}

export function formatMyeloSeqVariantType(finding) {
  const type = isFlt3Indel(finding) ? "INDEL" : getMyeloSeqVariantType(finding);
  const size = getMyeloSeqInsertionSize(finding);
  return size === undefined ? type : `${type} ${size}(bp)`;
}

// Reconcile only an explicitly annotated, in-frame FLT3 duplication. The coding
// range alone cannot supply amino acid identities: use the inserted peptide and
// require its length, position and final residue to agree with the source.
function matchingProteinDuplication(protein, duplication) {
  if (duplication.size % 3 !== 0) return undefined;
  const length = duplication.size / 3;
  const end = Math.ceil(duplication.end / 3);
  const start = end - length + 1;
  if (start <= 0) return undefined;
  const insertion = protein.match(/^p\.([A-Z])(\d+)_([A-Z])(\d+)ins([ACDEFGHIKLMNPQRSTVWY]+)$/);
  if (insertion) {
    const peptide = insertion[5];
    if (Number(insertion[2]) !== end || Number(insertion[4]) !== end + 1 ||
        peptide.length !== length || peptide[peptide.length - 1] !== insertion[1]) {
      return undefined;
    }
    return length === 1
      ? `p.${peptide[0]}${start}dup`
      : `p.${peptide[0]}${start}_${insertion[1]}${end}dup`;
  }
  const existing = protein.match(/^p\.([A-Z])(\d+)(?:_([A-Z])(\d+))?dup([ACDEFGHIKLMNPQRSTVWY]*)$/);
  if (!existing || Number(existing[2]) !== start || Number(existing[4] || existing[2]) !== end) {
    return undefined;
  }
  const peptide = existing[5];
  if (peptide && (peptide.length !== length || peptide[0] !== existing[1] ||
      peptide[peptide.length - 1] !== (existing[3] || existing[1]))) {
    return undefined;
  }
  return protein.slice(0, protein.indexOf("dup") + 3);
}

export function formatMyeloSeqFindingVariant(finding) {
  const variant = formatMyeloSeqVariant(isFlt3Indel(finding)
    ? sourceVariant(finding)
    : finding?.variant ?? finding?.Variant);
  const duplication = getFlt3Duplication(finding);
  if (!duplication || !duplication.sequenceMatchesRange) return variant;
  const parts = variant.split(/\s*,\s*(?=p\.)/);
  if (parts.length === 1 && /^c\./.test(parts[0])) return duplication.coding;
  if (parts.length !== 2 || !/^c\./.test(parts[0])) return variant;
  const protein = matchingProteinDuplication(parts[1], duplication);
  return protein ? `${duplication.coding}, ${protein}` : variant;
}

export function formatMyeloSeqFusionLocus(value) {
  const locus = String(value ?? "").trim();
  const parts = locus.split(/\s*(?:,|::|-(?=(?:chr)?[\w.]+\s*:))\s*/i);
  const coordinates = parts.map((part) => part.match(/^(?:chr)?([\w.]+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/i));
  if (parts.length > 2 || coordinates.some((coordinate) => !coordinate)) return locus;
  return coordinates.map(([, chromosome, start, end]) =>
    `chr${chromosome}:${start}${end ? `-${end}` : ""}`,
  ).join("-");
}

export function formatMyeloSeqDepth(value) {
  if (value == null || String(value).trim() === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("en-US", {
    useGrouping: false,
    maximumFractionDigits: 0,
  }).format(number);
}

export function formatMyeloSeqVaf(value) {
  if (value == null || String(value).trim() === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const percent = Math.abs(number) <= 1 ? number * 100 : number;
  return percent.toFixed(2);
}

const AMINO_ACIDS = {
  Ala: "A", Arg: "R", Asn: "N", Asp: "D", Cys: "C", Gln: "Q", Glu: "E",
  Gly: "G", His: "H", Ile: "I", Leu: "L", Lys: "K", Met: "M", Phe: "F",
  Pro: "P", Ser: "S", Thr: "T", Trp: "W", Tyr: "Y", Val: "V",
  Sec: "U", Pyl: "O", Asx: "B", Glx: "Z", Xaa: "X", Ter: "*",
};
const AMINO_ACID_PATTERN = new RegExp(Object.keys(AMINO_ACIDS).join("|"), "g");

export function formatMyeloSeqVariant(value) {
  const variant = String(value ?? "").trim().replace(
    /\bp\.[^\s/,]+/g,
    (protein) => protein.replace(AMINO_ACID_PATTERN, (aminoAcid) => AMINO_ACIDS[aminoAcid]),
  );
  const parts = variant.split(/\s*[/,]\s*(?=[cp]\.)/i);
  const coding = parts.find((part) => /^c\.\S/i.test(part));
  const protein = parts.find((part) => /^p\.\S/i.test(part));
  return parts.length === 2 && coding && protein
    ? `${coding}, ${protein}`
    : variant;
}
