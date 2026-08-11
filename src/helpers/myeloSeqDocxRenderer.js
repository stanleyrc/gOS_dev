import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import {
  getMyeloSeqFusionGeneExons,
  getMyeloSeqFusionName,
} from "./myeloSeqFusionName";
import { getMyeloSeqSpecimenFacts } from "./myeloSeqSpecimenFacts";

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SECTION_BLUE = "0563C1";
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;
const PAGE_MARGIN = 720;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const RESULT_TABLE_WIDTH = Math.round(CONTENT_WIDTH * 0.86);
const FUSION_RESULT_TABLE_WIDTH = CONTENT_WIDTH;
const FUSION_RESULT_COLUMN_WIDTHS = [0.29, 0.08, 0.21, 0.42].map(
  (ratio) => Math.round(FUSION_RESULT_TABLE_WIDTH * ratio),
);
const GENE_TABLE_WIDTH = Math.round(CONTENT_WIDTH * 0.62);
const TABLE_BORDER = {
  style: BorderStyle.SINGLE,
  size: 6,
  color: "000000",
};
const TABLE_BORDERS = {
  top: TABLE_BORDER,
  bottom: TABLE_BORDER,
  left: TABLE_BORDER,
  right: TABLE_BORDER,
  insideHorizontal: TABLE_BORDER,
  insideVertical: TABLE_BORDER,
};

const TIER_GUIDE = [
  "Tier 1 - variants with strong clinical significance.",
  "Tier 2 - variants with potential clinical significance.",
  "Tier 3 - variants with likely benign or unknown clinical significance.",
];

const BACKGROUND_PARAGRAPHS = [
  "The NYU Oncomine Myeloid panel is a multi-biomarker NGS assay that enables the detection of variants in 50 key hematological malignancy related genes.",
  "Purpose: To identify somatic mutations, and fusions in the tumor that may improve diagnosis, modify therapy or allow the patient to enter ongoing trials.",
];

const METHOD_INTRO =
  "DNA and (or) RNA were extracted from fresh peripheral blood and/or bone marrow specimens, were tested by next generation sequencing using the NYU Oncomine Myeloid panel for specific mutations in 50 genes some of which are covered fully in the design, others in specific hotspots as follows:";

const METHOD_GENE_TABLES = [
  {
    title: "22 hotspot genes",
    rows: [
      ["ABL1", "BRAF", "CBL", "CSF3R", "DNMT3A", "FLT3", "GATA2"],
      ["HRAS", "IDH1", "IDH2", "JAK2", "KIT", "KRAS", "MPL"],
      ["NPM1", "NRAS", "PTPN11", "SETBP1", "SF3B1", "SRSF2", "U2AF1"],
      ["WT1", "", "", "", "", "", ""],
    ],
  },
  {
    title: "16 full genes",
    rows: [
      ["ASXL1", "BCOR", "CALR", "CEBPA", "ETV6", "EZH2", "NF1"],
      ["PHF6", "PRPF8", "RB1", "RUNX1", "SH2B3", "STAG2", "TET2"],
      ["TP53", "ZRSR2", "", "", "", "", ""],
    ],
  },
  {
    title: "17 fusion drivers",
    rows: [
      ["ABL1", "BRAF", "CREBBP", "ETV6", "FGFR1", "FUS", "HMGA2"],
      ["JAK2", "KMT2A", "MECOM", "MYH11", "NTRK3", "NUP214", "PDGFRA"],
      ["PDGFRB", "RARA", "RUNX1", "", "", "", ""],
    ],
  },
];

const METHOD_CLOSING =
  "A detailed list of all regions covered by the test is available upon request. The specific mutations are detected by amplification of the corresponding exons by polymerase chain reaction (PCR). The PCR product is sequenced on an Ion Torrent S5 instrument. Analysis is performed using Ion Reporter Software 5.18.";

const REFERENCES = [
  "Izevbaye I, Liang LY, Mather C, El-Hallani S, Maglantay R Jr, Saini L. Clinical Validation of a Myeloid Next-Generation Sequencing Panel for Single-Nucleotide Variants, Insertions/Deletions, and Fusion Genes. J Mol Diagn. 2020;22(2):208-219. doi: 10.1016/j.jmoldx.2019.10.002. Epub 2019 Nov 18. PMID: 31751678.",
  "Mehrotra M, Duose DY, Singh RR, Barkoh BA, Manekia J, Harmon MA, et al. (2017). Versatile ion S5XL sequencer for targeted next generation sequencing of solid tumors in a clinical laboratory. PLoS ONE 12(8): e0181968. https://doi.org/10.1371/journal.pone.0181968",
];

const DISCLAIMERS = [
  {
    text: "Next generation sequencing can identify somatic mutations and fusions present in the tumor specimen. However, a negative test does not rule out the presence of malignancy. Results of this test must always be interpreted in the context of clinical, morphologic and immunophenotypic data.",
  },
  {
    text: "Diagnostic sensitivity:",
    children: [
      "This assay is designed to detect single nucleotide variants (SNV), small insertions/deletions (Indel) and gene fusions only within defined regions.",
    ],
  },
  {
    text: "Analytical sensitivity:",
    children: [
      "This assay may not detect certain SNV and Indel variants if the proportion of tumor cells in the sample studied is less than 10%. The maximum Indel length detected by this assay is 79bp. The lower limit of detection (variant frequency) for SNVs, and indels is 0.05 and 0.07, respectively.",
      "Fusions may not be detected if the proportion of tumor cells in the sample studied is less than 10%.",
    ],
  },
  {
    text: "Variants may not be detected in regions with coverage less than 500X and are therefore interpreted as indeterminate. A full list of those regions is available upon request.",
  },
  {
    text: "Results of this test are not sufficient for diagnosis and must always be interpreted in the context of clinical, morphologic and immunophenotypic data.",
  },
  { text: "This test is not designed for detection of minimal residual disease." },
  {
    text: "This test is not designed for detection of germline mutations. Genetic counselling and testing is necessary for analysis of germline mutations that may be associated with cancer.",
  },
  {
    text: "This test is not designed for detection of copy number gain or losses in tested genes.",
  },
  {
    text: "This test was developed and its performance characteristics determined by the Molecular Pathology Laboratory of New York University. It has not been cleared or approved by the U.S. Food and Drug Administration. The FDA has determined that such clearance or approval is not necessary.",
  },
];

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function formatNumber(value, maximumFractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(
    number,
  );
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const percent = Math.abs(number) <= 1 ? number * 100 : number;
  return formatNumber(percent, 1);
}

function isFusion(finding) {
  const type = `${finding?.eventType || ""} ${finding?.type || ""}`;
  return /fusion/i.test(type);
}

function stringValue(value) {
  return hasValue(value) ? String(value) : "";
}

function buildResultTable(title, columnDefinitions, findings, options = {}) {
  if (!findings.length) return null;
  const availableColumns = columnDefinitions.filter(
    (column) =>
      column.required || findings.some((finding) => hasValue(column.value(finding))),
  );

  return {
    title,
    columns: availableColumns.map((column) => column.label),
    rows: findings.map((finding) =>
      availableColumns.map((column) => ({
        value: stringValue(column.value(finding)),
        italics: Boolean(column.italics),
      })),
    ),
    ...options,
  };
}

function buildResultTables(report) {
  const alterations = Array.isArray(report?.alterations)
    ? report.alterations
    : [];
  const sequenceFindings = alterations.filter((finding) => !isFusion(finding));
  const fusionFindings = alterations.filter(isFusion);
  const baseColumns = [
    { label: "Gene", required: true, value: (finding) => finding.gene, italics: true },
    { label: "Variant", required: true, value: (finding) => finding.variant },
    { label: "Tier", required: true, value: (finding) => finding.tier },
    { label: "Variant Type", required: true, value: (finding) => finding.type },
  ];

  return [
    buildResultTable(
      "DNA Sequencing results",
      [
        ...baseColumns,
        { label: "VAF(%)", value: (finding) => formatPercent(finding.VAF) },
        {
          label: "Depth",
          value: (finding) => formatNumber(finding.depth, 0),
        },
        { label: "Transcript", value: (finding) => finding.transcript },
      ],
      sequenceFindings,
    ),
    buildResultTable(
      "Targeted RNA Sequencing results",
      [
        {
          label: "Gene(Exon)",
          required: true,
          value: getMyeloSeqFusionGeneExons,
          italics: true,
        },
        { label: "Tier", required: true, value: (finding) => finding.tier },
        {
          label: "Variant Type",
          required: true,
          value: (finding) => finding.type,
        },
        {
          label: "Locus",
          required: true,
          value: (finding) => finding.locus,
        },
      ],
      fusionFindings,
      {
        width: FUSION_RESULT_TABLE_WIDTH,
        columnWidths: FUSION_RESULT_COLUMN_WIDTHS,
      },
    ),
  ].filter(Boolean);
}

function buildFindingModel(finding) {
  const fusion = isFusion(finding);
  const identity = fusion
    ? getMyeloSeqFusionName(finding)
    : [finding.gene, finding.variant].filter(hasValue).join(", ");
  const lines = [];
  if (hasValue(identity)) {
    lines.push({
      label: fusion ? "Gene Fusion" : "Variant",
      value: String(identity),
    });
  }
  if (fusion && hasValue(finding.locus)) {
    lines.push({ label: "Breakpoint", value: String(finding.locus) });
  }
  lines.push({
    label: "Comments",
    value: stringValue(finding.variant_summary),
  });
  return { lines };
}

function buildTierSections(report) {
  const alterations = Array.isArray(report?.alterations)
    ? report.alterations
    : [];

  return ["1", "2", "3"]
    .map((tier) => ({
      tier,
      findings: alterations
        .filter((finding) => String(finding.tier) === tier)
        .map(buildFindingModel),
    }))
    .filter(({ findings }) => findings.length > 0);
}

function buildMyeloSeqDocxModel(report) {
  return {
    caseId: stringValue(report?.patient?.caseId),
    author: stringValue(report?.author),
    specimenFacts: getMyeloSeqSpecimenFacts(report),
    resultTables: buildResultTables(report),
    tierSections: buildTierSections(report),
    tierGuide: [...TIER_GUIDE],
    backgroundParagraphs: [...BACKGROUND_PARAGRAPHS],
    methods: {
      intro: METHOD_INTRO,
      geneTables: METHOD_GENE_TABLES.map((table) => ({
        title: table.title,
        rows: table.rows.map((row) => [...row]),
      })),
      closing: METHOD_CLOSING,
      references: [...REFERENCES],
    },
    disclaimers: DISCLAIMERS.map((disclaimer) => ({
      text: disclaimer.text,
      ...(disclaimer.children
        ? { children: [...disclaimer.children] }
        : {}),
    })),
  };
}

function createRuns(value, options = {}) {
  return String(value ?? "")
    .split("\n")
    .map(
      (line, index) =>
        new TextRun({
          ...options,
          text: line,
          ...(index > 0 ? { break: 1 } : {}),
        }),
    );
}

function createParagraph(value, options = {}) {
  const { run, ...paragraphOptions } = options;
  return new Paragraph({
    spacing: { after: 173, line: 307 },
    widowControl: true,
    ...paragraphOptions,
    children: createRuns(value, run),
  });
}

function createLabeledParagraph(label, value, options = {}) {
  return new Paragraph({
    spacing: { after: 0, line: 307 },
    widowControl: true,
    ...options,
    children: [
      new TextRun({ text: `${label}:`, bold: true }),
      ...createRuns(` ${value}`),
    ],
  });
}

function createSectionBar(label) {
  return new Paragraph({
    keepNext: true,
    spacing: { after: 432, line: 280 },
    shading: {
      type: ShadingType.CLEAR,
      fill: SECTION_BLUE,
      color: "auto",
    },
    children: [new TextRun({ text: label, color: "FFFFFF", size: 20 })],
  });
}

function equalColumnWidths(width, columnCount) {
  const baseWidth = Math.floor(width / columnCount);
  return Array.from({ length: columnCount }, (_, index) =>
    index === columnCount - 1
      ? width - baseWidth * (columnCount - 1)
      : baseWidth,
  );
}

function createTableCell(value, options = {}) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: options.alignment || AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 240 },
        children: [
          new TextRun({
            text: String(value ?? ""),
            bold: Boolean(options.bold),
            italics: Boolean(options.italics),
            size: 19,
          }),
        ],
      }),
    ],
  });
}

function createBorderedTable(rows, width, options = {}) {
  const columnCount = rows[0]?.length || 1;
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths:
      options.columnWidths || equalColumnWidths(width, columnCount),
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    margins: { top: 20, bottom: 20, left: 80, right: 80 },
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          tableHeader: options.header && rowIndex === 0,
          cantSplit: true,
          children: row.map((cell) =>
            createTableCell(cell.value ?? cell, {
              alignment: options.center
                ? AlignmentType.CENTER
                : AlignmentType.LEFT,
              bold: options.header && rowIndex === 0,
              italics: Boolean(cell.italics),
            }),
          ),
        }),
    ),
  });
}

function createResultTable(tableModel) {
  const rows = [
    tableModel.columns.map((value) => ({ value })),
    ...tableModel.rows,
  ];
  return createBorderedTable(rows, tableModel.width || RESULT_TABLE_WIDTH, {
    center: true,
    header: true,
    columnWidths: tableModel.columnWidths,
  });
}

function createGeneTable(tableModel) {
  return createBorderedTable(
    tableModel.rows.map((row) => row.map((value) => ({ value }))),
    GENE_TABLE_WIDTH,
  );
}

function createNumberedParagraph(index, value, level = 0) {
  const marker = level === 0
    ? `${index + 1}.`
    : `${String.fromCharCode(97 + index)}.`;
  return new Paragraph({
    indent: {
      left: level === 0 ? 270 : 540,
      hanging: 180,
    },
    spacing: { after: 0, line: 307 },
    widowControl: true,
    children: [
      new TextRun({ text: `${marker} ` }),
      ...createRuns(value),
    ],
  });
}

function createDocumentChildren(model) {
  const children = [createSectionBar("SPECIMEN")];
  model.specimenFacts.forEach(({ label, value }) => {
    children.push(
      createLabeledParagraph(label, value, { spacing: { after: 288, line: 307 } }),
    );
  });

  if (model.resultTables.length || model.tierSections.length) {
    children.push(createSectionBar("RESULTS"));
    model.resultTables.forEach((table) => {
      children.push(
        createParagraph(table.title, {
          keepNext: true,
          spacing: { after: 0, line: 307 },
          run: { bold: true },
        }),
        createResultTable(table),
        createParagraph("", { spacing: { after: 403 } }),
      );
    });
    model.tierSections.forEach(({ tier, findings }) => {
      children.push(
        createParagraph(`Tier ${tier}:`, {
          keepNext: true,
          spacing: { after: 0, line: 307 },
          run: { bold: true },
        }),
      );
      findings.forEach(({ lines }) => {
        lines.forEach(({ label, value }) => {
          children.push(createLabeledParagraph(label, value));
        });
        children.push(createParagraph("", { spacing: { after: 346 } }));
      });
    });
  }

  children.push(
    new Paragraph({
      spacing: { before: 403, after: 173, line: 307 },
      children: [
        new TextRun({ text: "Note:", bold: true }),
        new TextRun({ text: " Variants are categorized into three tiers:" }),
      ],
    }),
  );
  model.tierGuide.forEach((line) => {
    children.push(createParagraph(line, { spacing: { after: 0, line: 307 } }));
  });

  children.push(createSectionBar("BACKGROUND"));
  model.backgroundParagraphs.forEach((paragraph) => {
    children.push(createParagraph(paragraph));
  });

  children.push(createSectionBar("METHODS"), createParagraph(model.methods.intro));
  model.methods.geneTables.forEach((geneTable) => {
    children.push(
      createParagraph(`${geneTable.title}:`, {
        keepNext: true,
        spacing: { after: 0, line: 307 },
        run: { bold: true },
      }),
      createGeneTable(geneTable),
      createParagraph("", { spacing: { after: 58 } }),
    );
  });
  children.push(createParagraph(model.methods.closing));
  children.push(
    createParagraph("References:", {
      keepNext: true,
      spacing: { after: 0, line: 307 },
      run: { bold: true },
    }),
  );
  model.methods.references.forEach((reference, index) => {
    children.push(createNumberedParagraph(index, reference));
  });

  children.push(createSectionBar("DISCLAIMERS"));
  model.disclaimers.forEach((disclaimer, index) => {
    children.push(createNumberedParagraph(index, disclaimer.text));
    (disclaimer.children || []).forEach((child, childIndex) => {
      children.push(createNumberedParagraph(childIndex, child, 1));
    });
  });

  return children;
}

function createMyeloSeqDocxDocument(model) {
  return new Document({
    title: `Clinical Report — ${model.caseId || "Patient"}`,
    creator: model.author,
    styles: {
      default: {
        document: {
          run: {
            font: "Arial",
            size: 20,
          },
          paragraph: {
            spacing: { after: 173, line: 307 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: {
              top: PAGE_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
            },
          },
        },
        children: createDocumentChildren(model),
      },
    ],
  });
}

class MyeloSeqDocxRenderer {
  async render(report, options = {}) {
    const model = buildMyeloSeqDocxModel(report);
    const document = createMyeloSeqDocxDocument(model);
    const blob = await Packer.toBlob(document);

    return {
      blob,
      mimeType: DOCX_MIME_TYPE,
      extension: ".docx",
      filename:
        options.filename ||
        `report-${model.caseId || "patient"}-${model.author}.docx`,
    };
  }
}

export {
  buildMyeloSeqDocxModel,
  createMyeloSeqDocxDocument,
  DOCX_MIME_TYPE,
  MyeloSeqDocxRenderer,
};
