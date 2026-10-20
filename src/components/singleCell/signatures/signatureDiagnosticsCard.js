import React, { useMemo, useState } from "react";
import { Alert, Card, Empty, Radio, Space, Table, Tooltip, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useSignatureVersions, { NOT_EXPORTED } from "./signatureVersionsData";
import {
  DIAG_COSINES,
  SBS96_CHANNELS,
  burdenHistogram,
  diagnosticsHeadline,
  diagnosticsRows,
} from "../../../helpers/singleCell/signatureVersions";

const { Text } = Typography;
const TYPE_COLORS = ["#03bcee", "#010101", "#e32926", "#999999", "#a2cf64", "#ecc6c5"];
const f2 = (x) => (x == null ? "n/a" : Number(x).toFixed(2));
const heat = (v) => (v == null ? undefined : `rgba(214, 96, 77, ${Math.max(0, Math.min(1, v)) * 0.75})`);

/** 96-channel spectrum (fractions) as bars coloured by mutation type. */
function Spectrum({ values, width = 230, height = 46 }) {
  const max = Math.max(...values, 1e-9);
  const bw = width / 96;
  return (
    <svg width={width} height={height} role="img" aria-label="96-channel spectrum">
      {values.map((v, i) => (
        <rect key={i} x={i * bw} y={height - (v / max) * (height - 2)} width={Math.max(1, bw - 0.4)} height={(v / max) * (height - 2)} fill={TYPE_COLORS[Math.floor(i / 16)]}>
          <title>{`${SBS96_CHANNELS[i]}: ${(100 * v).toFixed(2)}%`}</title>
        </rect>
      ))}
    </svg>
  );
}

function BurdenHist({ hist, width, height = 90 }) {
  if (!hist.bins.length) return <Text type="secondary">not available (no per-cell singleton counts)</Text>;
  const L = 34;
  const bw = (width - L) / hist.bins.length;
  return (
    <svg style={{ display: "block" }} width={width} height={height + 24} role="img" aria-label="Histogram of singletons per cell">
      {hist.bins.map((b, i) => (
        <rect key={i} x={L + i * bw} y={height - (b.count / hist.max) * height} width={Math.max(1, bw - 1)} height={(b.count / hist.max) * height} fill="#6a8caf">
          <title>{`${Math.round(b.x0)} to ${Math.round(b.x1)} singletons: ${b.count} cells`}</title>
        </rect>
      ))}
      <text x={L - 4} y={10} fontSize={10} textAnchor="end" fill="currentColor">{hist.max}</text>
      <text x={L - 4} y={height} fontSize={10} textAnchor="end" fill="currentColor">0</text>
      <text x={L} y={height + 14} fontSize={10} fill="currentColor">{Math.round(hist.bins[0].x0).toLocaleString("en-US")}</text>
      <text x={width} y={height + 14} fontSize={10} textAnchor="end" fill="currentColor">{Math.round(hist.bins[hist.bins.length - 1].x1).toLocaleString("en-US")} singletons per cell</text>
    </svg>
  );
}

/**
 * Artifact diagnostics (signature_versions.json diagnostics): per SNV group the cosine to reference/artifact spectra,
 * spectrum entropy, CpG C>T fraction and read evidence, the 96-channel spectra, and the per-cell singleton burden.
 */
export default function SignatureDiagnosticsCard() {
  const { data } = useSignatureVersions();
  const [ref, width] = useContainerWidth(900);
  const [metric, setMetric] = useState("singleton");
  const rows = useMemo(() => diagnosticsRows(data), [data]);
  const headline = useMemo(() => diagnosticsHeadline(data), [data]);
  const hist = useMemo(() => burdenHistogram(data, metric), [data, metric]);
  const title = <Space><ExperimentOutlined />Singleton and artifact diagnostics</Space>;
  if (!data) {
    return (
      <Card size="small" title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={NOT_EXPORTED} />
      </Card>
    );
  }
  if (!rows.length) {
    return (
      <Card size="small" title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (signature_versions.json has no diagnostics)" />
      </Card>
    );
  }
  const maxBits = rows.find((r) => r.entropyMax)?.entropyMax;
  const columns = [
    { title: "Group", dataIndex: "group", fixed: "left", render: (g, r) => <Tooltip title={r.definition}><Text strong>{g}</Text></Tooltip> },
    { title: "SNVs", dataIndex: "n", align: "right", render: (v) => v.toLocaleString("en-US") },
    ...DIAG_COSINES.map((c) => ({
      title: <Tooltip title={`cosine of the group's 96-channel spectrum to ${c.label}`}>{`cos ${c.label}`}</Tooltip>,
      key: c.key,
      align: "right",
      onCell: (r) => ({ style: { background: heat(r.cosines[c.key]) } }),
      render: (_, r) => f2(r.cosines[c.key]),
    })),
    { title: <Tooltip title="Shannon entropy of the 96-channel spectrum; a uniform spectrum is the maximum.">{`entropy (bits${maxBits ? ` of ${maxBits.toFixed(2)}` : ""})`}</Tooltip>, key: "ent", align: "right", render: (_, r) => (r.entropy == null ? "n/a" : r.entropy.toFixed(2)) },
    { title: "CpG C>T", key: "cpg", align: "right", render: (_, r) => (r.cpg == null ? "n/a" : `${(100 * r.cpg).toFixed(0)}%`) },
    { title: "median VAF", key: "vaf", align: "right", render: (_, r) => f2(r.vafMedian) },
    { title: "one strand", key: "os", align: "right", render: (_, r) => (r.oneStrand == null ? "n/a" : `${(100 * r.oneStrand).toFixed(0)}%`) },
  ];
  const spW = Math.max(200, Math.min(300, Math.floor((width - 3 * 12) / 4)));
  return (
    <Card size="small" title={title}>
      <div ref={ref}>
        {headline && <Alert type="info" showIcon style={{ marginBottom: 8 }} message={headline} />}
        <Table size="small" pagination={false} rowKey="group" dataSource={rows} columns={columns} scroll={{ x: "max-content" }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Cosine shading = similarity of the group's spectrum to each reference. Read evidence (VAF, strand) comes from the VCF; singletons carry one cell's reads.
        </Text>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {rows.filter((r) => r.spectrum && r.n > 0).map((r) => (
            <div key={r.group} style={{ width: spW }}>
              <Text style={{ fontSize: 12 }} strong>{r.group}</Text> <Text type="secondary" style={{ fontSize: 11 }}>n={r.n.toLocaleString("en-US")}</Text>
              <Spectrum values={r.spectrum} width={spW} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "block", clear: "both" }}>
          <Space style={{ marginBottom: 4, display: "flex" }} wrap>
            <Text strong>Singletons per cell</Text>
            <Radio.Group size="small" optionType="button" value={metric} onChange={(e) => setMetric(e.target.value)}
              options={[{ value: "singleton", label: "callable" }, { value: "singleton_lowconf", label: "low confidence" }, { value: "normal_singleton", label: "normal cells" }]} />
            {hist.median != null && <Text type="secondary">{hist.n} cells, median {Math.round(hist.median).toLocaleString("en-US")}</Text>}
          </Space>
          <BurdenHist hist={hist} width={Math.min(width, 700)} />
        </div>
      </div>
    </Card>
  );
}
