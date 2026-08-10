import { escapeHtml } from "./format";
import { getMyeloSeqSpecimenFacts } from "./myeloSeqSpecimenFacts";

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function firstValue(...values) {
  return values.find(hasValue);
}

function formatNumber(value, maximumFractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(number);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const percent = Math.abs(number) <= 1 ? number * 100 : number;
  return formatNumber(percent, 1);
}

function text(value) {
  return escapeHtml(hasValue(value) ? String(value) : "");
}

function isFusion(finding) {
  const type = `${finding?.eventType || ""} ${finding?.type || ""}`;
  return /fusion/i.test(type);
}

function renderSectionBar(label) {
  return `<h2 class="section-bar">${text(label)}</h2>`;
}

function renderFact(label, value) {
  if (!hasValue(value)) return "";
  return `<p class="fact"><strong>${text(label)}:</strong> ${text(value)}</p>`;
}

function renderTable(title, columns, rows) {
  if (!rows.length) return "";
  const availableColumns = columns.filter(
    (column) => column.required || rows.some((row) => hasValue(column.value(row)))
  );
  const header = availableColumns
    .map((column) => `<th>${text(column.label)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) => `<tr>${availableColumns
        .map((column) => {
          const value = column.value(row);
          const className = column.className ? ` class="${column.className}"` : "";
          return `<td${className}>${text(value)}</td>`;
        })
        .join("")}</tr>`
    )
    .join("");

  return `<section class="result-table">
    <h3>${text(title)}</h3>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function buildSpecimenSection(report) {
  const facts = getMyeloSeqSpecimenFacts(report);

  return `${renderSectionBar("SPECIMEN")}
  <section class="specimen-facts">${facts
    .map(({ label, value }) => renderFact(label, value))
    .join("")}</section>`;
}

function buildSequenceTables(report) {
  const alterations = Array.isArray(report?.alterations) ? report.alterations : [];
  const sequenceFindings = alterations.filter((finding) => !isFusion(finding));
  const fusionFindings = alterations.filter(isFusion);
  const baseColumns = [
    { label: "Gene", required: true, value: (finding) => finding.gene, className: "gene-cell" },
    { label: "Variant", required: true, value: (finding) => finding.variant },
    { label: "Tier", required: true, value: (finding) => finding.tier },
    { label: "Variant Type", required: true, value: (finding) => finding.type },
  ];
  const sequenceColumns = [
    ...baseColumns,
    { label: "VAF(%)", value: (finding) => formatPercent(finding.VAF) },
    { label: "Depth", value: (finding) => formatNumber(finding.depth, 0) },
    { label: "Transcript", value: (finding) => finding.transcript },
  ];
  const fusionColumns = [
    {
      label: "Gene(Exon)",
      required: true,
      value: (finding) => firstValue(finding.variant, finding.gene),
      className: "gene-cell",
    },
    { label: "Tier", required: true, value: (finding) => finding.tier },
    { label: "Variant Type", required: true, value: (finding) => finding.type },
    { label: "Locus", value: (finding) => finding.locus },
  ];

  return [
    renderTable("DNA Sequencing results", sequenceColumns, sequenceFindings),
    renderTable("Targeted RNA Sequencing results", fusionColumns, fusionFindings),
  ]
    .filter(Boolean)
    .join("");
}

function renderInterpretationLine(label, value) {
  if (!hasValue(value)) return "";
  return `<p><strong>${text(label)}:</strong> ${text(value)}</p>`;
}

function renderComments(finding) {
  return `<p><strong>Comments:</strong> <span class="report-comment-value">${text(finding?.variant_summary)}</span></p>`;
}

function renderFinding(finding) {
  const fusion = isFusion(finding);
  const heading = fusion
    ? renderInterpretationLine(
        "Gene Fusion",
        firstValue(finding.variant, finding.gene),
      )
    : renderInterpretationLine(
        "Variant",
        [finding.gene, finding.variant].filter(hasValue).join(", "),
      );
  const breakpoint = fusion
    ? renderInterpretationLine("Breakpoint", finding.locus)
    : "";
  const comments = renderComments(finding);

  return `<article class="finding-interpretation">${heading}${breakpoint}${comments}</article>`;
}

function buildTierInterpretations(report) {
  const alterations = Array.isArray(report?.alterations) ? report.alterations : [];
  const tiers = ["1", "2", "3"];

  return tiers
    .map((tier) => {
      const findings = alterations.filter((finding) => String(finding.tier) === tier);
      if (!findings.length) return "";
      return `<section class="tier-section"><h3>Tier ${tier}:</h3>${findings
        .map(renderFinding)
        .join("")}</section>`;
    })
    .filter(Boolean)
    .join("");
}

function buildTierGuide() {
  return `<section class="tier-guide">
    <p><strong>Note:</strong> Variants are categorized into three tiers:</p>
    <p>Tier 1 - variants with strong clinical significance.<br>
    Tier 2 - variants with potential clinical significance.<br>
    Tier 3 - variants with likely benign or unknown clinical significance.</p>
  </section>`;
}

function renderGeneTable(title, rows) {
  return `<section class="gene-list"><h3>${title}:</h3><table><tbody>${rows
    .map((row) => `<tr>${row.map((gene) => `<td>${gene}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></section>`;
}

function buildBackground() {
  return `${renderSectionBar("BACKGROUND")}
  <section>
    <p>The NYU Oncomine Myeloid panel is a multi-biomarker NGS assay that enables the detection of variants in 50 key hematological malignancy related genes.</p>
    <p>Purpose: To identify somatic mutations, and fusions in the tumor that may improve diagnosis, modify therapy or allow the patient to enter ongoing trials.</p>
  </section>`;
}

function buildMethods() {
  const hotspotGenes = [
    ["ABL1", "BRAF", "CBL", "CSF3R", "DNMT3A", "FLT3", "GATA2"],
    ["HRAS", "IDH1", "IDH2", "JAK2", "KIT", "KRAS", "MPL"],
    ["NPM1", "NRAS", "PTPN11", "SETBP1", "SF3B1", "SRSF2", "U2AF1"],
    ["WT1", "", "", "", "", "", ""],
  ];
  const fullGenes = [
    ["ASXL1", "BCOR", "CALR", "CEBPA", "ETV6", "EZH2", "NF1"],
    ["PHF6", "PRPF8", "RB1", "RUNX1", "SH2B3", "STAG2", "TET2"],
    ["TP53", "ZRSR2", "", "", "", "", ""],
  ];
  const fusionDrivers = [
    ["ABL1", "BRAF", "CREBBP", "ETV6", "FGFR1", "FUS", "HMGA2"],
    ["JAK2", "KMT2A", "MECOM", "MYH11", "NTRK3", "NUP214", "PDGFRA"],
    ["PDGFRB", "RARA", "RUNX1", "", "", "", ""],
  ];

  return `${renderSectionBar("METHODS")}
  <section>
    <p>DNA and (or) RNA were extracted from fresh peripheral blood and/or bone marrow specimens, were tested by next generation sequencing using the NYU Oncomine Myeloid panel for specific mutations in 50 genes some of which are covered fully in the design, others in specific hotspots as follows:</p>
    ${renderGeneTable("22 hotspot genes", hotspotGenes)}
    ${renderGeneTable("16 full genes", fullGenes)}
    ${renderGeneTable("17 fusion drivers", fusionDrivers)}
    <p>A detailed list of all regions covered by the test is available upon request. The specific mutations are detected by amplification of the corresponding exons by polymerase chain reaction (PCR). The PCR product is sequenced on an Ion Torrent S5 instrument. Analysis is performed using Ion Reporter Software 5.18.</p>
    <div class="references"><strong>References:</strong>
      <ol>
        <li>Izevbaye I, Liang LY, Mather C, El-Hallani S, Maglantay R Jr, Saini L. Clinical Validation of a Myeloid Next-Generation Sequencing Panel for Single-Nucleotide Variants, Insertions/Deletions, and Fusion Genes. J Mol Diagn. 2020;22(2):208-219. doi: 10.1016/j.jmoldx.2019.10.002. Epub 2019 Nov 18. PMID: 31751678.</li>
        <li>Mehrotra M, Duose DY, Singh RR, Barkoh BA, Manekia J, Harmon MA, et al. (2017). Versatile ion S5XL sequencer for targeted next generation sequencing of solid tumors in a clinical laboratory. PLoS ONE 12(8): e0181968. https://doi.org/10.1371/journal.pone.0181968</li>
      </ol>
    </div>
  </section>`;
}

function buildDisclaimers() {
  return `${renderSectionBar("DISCLAIMERS")}
  <section class="disclaimers">
    <ol>
      <li>Next generation sequencing can identify somatic mutations and fusions present in the tumor specimen. However, a negative test does not rule out the presence of malignancy. Results of this test must always be interpreted in the context of clinical, morphologic and immunophenotypic data.</li>
      <li>Diagnostic sensitivity:
        <ol type="a"><li>This assay is designed to detect single nucleotide variants (SNV), small insertions/deletions (Indel) and gene fusions only within defined regions.</li></ol>
      </li>
      <li>Analytical sensitivity:
        <ol type="a">
          <li>This assay may not detect certain SNV and Indel variants if the proportion of tumor cells in the sample studied is less than 10%. The maximum Indel length detected by this assay is 79bp. The lower limit of detection (variant frequency) for SNVs, and indels is 0.05 and 0.07, respectively.</li>
          <li>Fusions may not be detected if the proportion of tumor cells in the sample studied is less than 10%.</li>
        </ol>
      </li>
      <li>Variants may not be detected in regions with coverage less than 500X and are therefore interpreted as indeterminate. A full list of those regions is available upon request.</li>
      <li>Results of this test are not sufficient for diagnosis and must always be interpreted in the context of clinical, morphologic and immunophenotypic data.</li>
      <li>This test is not designed for detection of minimal residual disease.</li>
      <li>This test is not designed for detection of germline mutations. Genetic counselling and testing is necessary for analysis of germline mutations that may be associated with cancer.</li>
      <li>This test is not designed for detection of copy number gain or losses in tested genes.</li>
      <li>This test was developed and its performance characteristics determined by the Molecular Pathology Laboratory of New York University. It has not been cleared or approved by the U.S. Food and Drug Administration. The FDA has determined that such clearance or approval is not necessary.</li>
    </ol>
  </section>`;
}

function getInlineCss() {
  return `
    @page { size: Letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    html { background: #d7d7d7; }
    body {
      margin: 0;
      color: #000;
      background: #d7d7d7;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.28;
    }
    .report-document {
      width: 8.5in;
      min-height: 11in;
      margin: 24px auto;
      padding: 0.5in;
      background: #fff;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.22);
    }
    p { margin: 0 0 0.12in; }
    .section-bar {
      margin: 0 0 0.3in;
      padding: 0 1px;
      color: #fff;
      background: #0563c1;
      font-size: 10pt;
      font-weight: 400;
      line-height: 14pt;
      break-after: avoid;
    }
    .specimen-facts { margin-bottom: 0.18in; }
    .fact { margin: 0 0 0.2in 1px; }
    .result-table { margin: 0 0 0.28in; }
    h3 {
      margin: 0;
      font-size: 10pt;
      font-weight: 700;
      break-after: avoid;
    }
    table { border-collapse: collapse; }
    .result-table table { width: 86%; }
    .result-table th,
    .result-table td {
      border: 0.75pt solid #000;
      padding: 2px 6px;
      text-align: center;
      font-size: 9.5pt;
      line-height: 1.15;
    }
    .result-table th { font-weight: 700; }
    .result-table .gene-cell { font-style: italic; }
    .tier-section { margin: 0 0 0.28in; }
    .finding-interpretation { margin: 0 0 0.24in; }
    .finding-interpretation p { margin: 0; white-space: pre-wrap; }
    .report-comment-value {
      display: inline-block;
      min-width: 0.5em;
      min-height: 1em;
      vertical-align: top;
      white-space: pre-wrap;
    }
    .report-comment-value[data-report-editing="true"] {
      outline: 1px dashed #8c8c8c;
      outline-offset: 1px;
      cursor: text;
    }
    .report-comment-value[data-report-editing="true"]:focus {
      outline: 2px solid #0563c1;
    }
    .report-comment-value[data-report-editing="true"]:empty::before {
      color: #8c8c8c;
      content: attr(aria-placeholder);
    }
    .tier-guide { margin: 0.28in 0 0.12in; }
    section > p { orphans: 3; widows: 3; }
    .gene-list { margin: 0.16in 0 0.04in; }
    .gene-list table { width: 62%; table-layout: fixed; }
    .gene-list td {
      border: 0.75pt solid #000;
      height: 0.19in;
      padding: 1px 2px;
      font-size: 9.5pt;
    }
    .references { margin: 0.2in 0; }
    ol { margin: 0; padding-left: 1.3em; }
    .references ol,
    .disclaimers > ol { padding-left: 1.15em; }
    .disclaimers ol[type="a"] { padding-left: 1.6em; }
    li { margin: 0; }
    @media screen and (max-width: 900px) {
      .report-document {
        width: calc(100% - 24px);
        min-height: 0;
        margin: 12px;
        padding: 24px;
      }
      .result-table table,
      .gene-list table { width: 100%; }
    }
    @media print {
      html, body { background: #fff; }
      .report-document {
        width: auto;
        min-height: 0;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
    }
  `.trim();
}

class MyeloSeqHtmlRenderer {
  async render(report, options = {}) {
    const patient = report?.patient || {};
    const caseId = hasValue(patient.caseId) ? String(patient.caseId) : "";
    const author = hasValue(report?.author) ? String(report.author) : "";
    const results = `${buildSequenceTables(report)}${buildTierInterpretations(report)}`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${text(`Clinical Report — ${caseId || "Patient"}`)}</title>
  <style>${getInlineCss()}</style>
</head>
<body>
  <main class="report-document">
    ${buildSpecimenSection(report)}
    ${results ? `${renderSectionBar("RESULTS")}${results}` : ""}
    ${buildTierGuide()}
    ${buildBackground()}
    ${buildMethods()}
    ${buildDisclaimers()}
  </main>
</body>
</html>`;

    return {
      html,
      mimeType: "text/html",
      extension: ".html",
      filename: options.filename || `report-${caseId || "patient"}-${author}.html`,
    };
  }
}

export { MyeloSeqHtmlRenderer };
