import React, { useMemo, useState } from "react";
import { Alert, Card, Empty, Input, Segmented, Select, Skeleton, Space, Table, Tag, Tooltip, Typography } from "antd";
import { BULK_DATASET_ID, bulkDonorUrl, bulkLinkProblem, filterDonors, filterOptions, fmtPrevalence, summarizeSources } from "../../../helpers/singleCell/bulkCohort";
import useCohortExport from "./useCohortExport";

const { Text } = Typography;
const ORIGIN_COLOR = {
  "simple circle": "#4E79A7",
  "complex single-chromosome": "#F28E2B",
  "fold-back / BFB": "#E15759",
  "multi-chromosome": "#76B7B2",
  "excision scar": "#B07AA1",
};

function Stat({ label, tip, children }) {
  return (
    <Tooltip title={tip}>
      <div style={{ minWidth: 150 }}>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{label}</div>
        <div style={{ fontWeight: 600 }}>{children}</div>
      </div>
    </Tooltip>
  );
}

function OriginBar({ origins }) {
  const total = origins.reduce((s, o) => s + o.n, 0);
  if (!total) return <Text type="secondary">not available (no ecDNA-like units)</Text>;
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
        {origins.map((o) => <div key={o.name} title={`${o.name}: ${o.n}`} style={{ width: `${(100 * o.n) / total}%`, background: ORIGIN_COLOR[o.name] || "#999" }} />)}
      </div>
      <Space size={[4, 2]} wrap>
        {origins.map((o) => <Tag key={o.name} color={ORIGIN_COLOR[o.name] || "default"} style={{ marginInlineEnd: 0 }}>{o.name} {o.n}</Tag>)}
      </Space>
    </div>
  );
}

function SourceCard({ summary, href, linkProblem }) {
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState(null);
  const [gene, setGene] = useState(null);
  const [ecdna, setEcdna] = useState("any");
  const opts = useMemo(() => filterOptions(summary.rows), [summary.rows]);
  const rows = useMemo(() => filterDonors(summary.rows, { query, origin, gene, ecdna }), [summary.rows, query, origin, gene, ecdna]);
  const open = (r) => window.open(bulkDonorUrl(window.location.href, BULK_DATASET_ID, r.donor, r.location), "_blank", "noopener");
  const columns = [
    {
      title: "Donor", dataIndex: "donor", sorter: (a, b) => a.donor.localeCompare(b.donor), width: 150,
      render: (d, r) => (linkProblem || !r.has_graph
        ? <Text>{d}</Text>
        : <Tooltip title={r.has_coverage ? "Open the genome graph and coverage at the amplicon (new tab)" : "Open the genome graph at the amplicon (new tab); coverage is not available for this donor"}>
            <a href={bulkDonorUrl(href, BULK_DATASET_ID, d, r.location)} onClick={(e) => { e.preventDefault(); open(r); }}>{d}</a>
          </Tooltip>),
    },
    { title: "ecDNA (gGnome)", dataIndex: "ecdna_ggnome", width: 110, sorter: (a, b) => Number(a.ecdna_ggnome) - Number(b.ecdna_ggnome), render: (v) => (v ? <Tag color="red">yes</Tag> : <Tag>no</Tag>) },
    { title: "ecDNA (AA)", dataIndex: "ecdna_aa", width: 100, render: (v) => (v == null ? <Text type="secondary">n/a</Text> : v ? <Tag color="red">yes</Tag> : <Tag>no</Tag>) },
    { title: "Origin class", dataIndex: "origin", render: (v) => (v ? <Tag color={ORIGIN_COLOR[v]}>{v}</Tag> : "") },
    { title: "Amplified genes", dataIndex: "genes", render: (gs) => (gs || []).join(", ") },
    { title: "EGFRvIII", dataIndex: "egfrviii", width: 80, render: (v) => (v ? "yes" : "") },
    { title: "Coverage", dataIndex: "has_coverage", width: 90, render: (v) => (v ? "yes" : <Text type="secondary">no</Text>) },
  ];
  return (
    <Card size="small" title={<span>{summary.label} <Text type="secondary">· {summary.n} {summary.tumorType} donors</Text></span>} style={{ marginBottom: 16 }}>
      <Space size={24} wrap align="start" style={{ marginBottom: 12 }}>
        <Stat label="ecDNA, gGnome" tip="Donors with a gGnome dm, cpxdm or tyfonas event">{fmtPrevalence(summary.ggnome.n, summary.ggnome.total)}</Stat>
        <Stat label="ecDNA, AmpliconArchitect" tip="Donors with an AmpliconArchitect table (TCGA/PCAWG only)">{fmtPrevalence(summary.aa.n, summary.aa.total)}</Stat>
        <Stat label="EGFRvIII-type junction" tip="intron 1 to intron 7 DEL-like junction in the graph">{summary.egfrviii} donors</Stat>
        <Stat label="Graph / coverage" tip="Donors with an exported genome graph and binned coverage">{summary.withGraph} / {summary.withCoverage}{summary.withCoverage === 0 ? " (coverage not available: files no longer on disk)" : ""}</Stat>
      </Space>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 320px" }}>
          <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 2 }}>Origin class of ecDNA-like units (per donor, highest-priority class)</div>
          <OriginBar origins={summary.origins} />
        </div>
        <div style={{ flex: "1 1 240px" }}>
          <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 2 }}>Top amplified genes (donors)</div>
          <Space size={[4, 2]} wrap>
            {summary.genes.length ? summary.genes.map((g) => <Tag key={g.name} style={{ marginInlineEnd: 0 }}>{g.name} {g.n}</Tag>) : <Text type="secondary">not available (no amplified panel genes)</Text>}
          </Space>
        </div>
      </div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Input.Search allowClear size="small" placeholder="Search donor or gene" style={{ width: 200 }} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select allowClear size="small" placeholder="Origin class" style={{ width: 210 }} value={origin} onChange={setOrigin} options={opts.origins.map((o) => ({ value: o.name, label: `${o.name} (${o.n})` }))} />
        <Select allowClear showSearch size="small" placeholder="Amplified gene" style={{ width: 150 }} value={gene} onChange={setGene} options={opts.genes.map((o) => ({ value: o.name, label: `${o.name} (${o.n})` }))} />
        <Segmented size="small" value={ecdna} onChange={setEcdna} options={[{ value: "any", label: "All" }, { value: "yes", label: "ecDNA" }, { value: "no", label: "No ecDNA" }]} />
        <Text type="secondary">{rows.length} of {summary.n}</Text>
      </Space>
      <Table size="small" rowKey="donor" columns={columns} dataSource={rows} pagination={{ pageSize: 8, size: "small", hideOnSinglePage: true }} />
    </Card>
  );
}

/** Cohort view: one card per bulk WGS source with a searchable donor table linking to the bulk Genome View. */
export default function CohortBulkPanel({ dataset, datasets }) {
  const { status, data } = useCohortExport(dataset, "bulk_cohort.json");
  const [tumorType, setTumorType] = useState("GBM");
  const summaries = useMemo(() => summarizeSources(data?.rows, tumorType), [data, tumorType]);
  if (status === "loading") return <Skeleton active />;
  if (!data) return <Empty description="Bulk cohort is not available (_cohort/bulk_cohort.json not exported; srctools bc06_bulk_cards.R)." />;
  const problem = bulkLinkProblem(datasets);
  return (
    <div>
      {problem && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`Donor graphs cannot be opened: ${problem}.`} />}
      <Space style={{ marginBottom: 12 }} wrap>
        <Segmented value={tumorType} onChange={setTumorType} options={[{ value: "GBM", label: "GBM" }, { value: "LGG", label: "LGG (contrast)" }]} />
        <Text type="secondary">Bulk WGS, hg19. {data.note}</Text>
      </Space>
      {summaries.length ? summaries.map((s) => <SourceCard key={`${tumorType}-${s.source}`} summary={s} href={window.location.href} linkProblem={problem} />) : <Empty description={`No ${tumorType} donors in the export.`} />}
    </div>
  );
}
