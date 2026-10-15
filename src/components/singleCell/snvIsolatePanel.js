import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { Button, Card, Space, Table, Tag, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import useContainerWidth from "./useContainerWidth";
import useSignatureModel from "./signatures/useSignatureModel";
import { Profile } from "./signaturePanel";
import { f1Comparison, isolateTable, spectrumFit, tableTsv } from "../../helpers/singleCell/snvIsolate";

const { Text } = Typography;
const HIST_H = 110;
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "n/a");

/** Clade-F1 histogram: the isolated subset (blue) against all sites (grey outline). */
function F1Histogram({ cmp, width }) {
  const bins = cmp.subset.fractions.length;
  const left = 30;
  const w = (width - left - 4) / bins;
  const max = Math.max(0.01, ...cmp.subset.fractions, ...cmp.all.fractions);
  const y = (f) => HIST_H - 18 - (f / max) * (HIST_H - 30);
  return (
    <svg width={width} height={HIST_H}>
      {cmp.subset.fractions.map((f, k) => (
        <g key={k}>
          <rect x={left + k * w} y={y(f)} width={Math.max(1, w - 2)} height={HIST_H - 18 - y(f)} fill="#4c78a8">
            <title>{`F1 ${(k / bins).toFixed(1)}-${((k + 1) / bins).toFixed(1)}: ${cmp.subset.counts[k]} isolated sites (${(f * 100).toFixed(0)}%), all sites ${(cmp.all.fractions[k] * 100).toFixed(0)}%`}</title>
          </rect>
          <rect x={left + k * w} y={y(cmp.all.fractions[k])} width={Math.max(1, w - 2)} height={HIST_H - 18 - y(cmp.all.fractions[k])} fill="none" stroke="#7f7f7f" strokeWidth={1.2} />
          <text x={left + (k + 0.5) * w} y={HIST_H - 4} fontSize={9} textAnchor="middle" fill="var(--sc-muted, #666)">
            {(k / bins).toFixed(1)}
          </text>
        </g>
      ))}
      <text x={2} y={12} fontSize={9} fill="var(--sc-muted, #666)">{`${Math.round(max * 100)}%`}</text>
    </svg>
  );
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/tab-separated-values" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The isolated subset: how many sites, where they sit, the fit to the tree
 * (clade-F1 distribution against all sites) and to the signature (96-channel
 * spectrum against the reference profile with the cosine), and a table of
 * the positions that can be saved as TSV.
 * @param snv the matrix, columns the filtered variant indices, annot its annotations
 * @param branchInfo { branches, sites } placement on the tree (Single-Cell tab) or null
 * @param carrierCount cells carrying at least one isolated site
 */
export default function SnvIsolatePanel({ snv, columns, annot, branchInfo = null, carrierCount = null, patient = "" }) {
  const layout = useSelector((s) => s.SingleCell.layout) || {};
  const model = useSignatureModel();
  const [ref, width] = useContainerWidth(900);
  const rows = useMemo(() => (snv ? isolateTable(snv, annot, columns) : []), [snv, annot, columns]);
  const cmp = useMemo(() => f1Comparison(annot, columns), [annot, columns]);
  // the signature to fit: the one filtered on, else the commonest among the isolated sites
  const signature = useMemo(() => {
    const picked = layout.snvAnnotFilter?.signature?.values;
    if (picked?.length === 1) return picked[0];
    const counts = {};
    columns.forEach((c) => {
      const s = annot?.cat.signature?.[c];
      if (s) counts[s] = (counts[s] || 0) + 1;
    });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || null;
  }, [layout.snvAnnotFilter, columns, annot]);
  const fit = useMemo(() => (snv && model.ready && signature ? spectrumFit(snv, columns, model.reference, signature, annot) : null), [snv, columns, model, signature, annot]);
  if (!snv) return null;
  const tableColumns = [
    { title: "Mutation", dataIndex: "label", sorter: (a, b) => `${a.label}`.localeCompare(`${b.label}`), render: (x, r) => <span title={r.site}>{x}</span> },
    { title: "Gene", dataIndex: "gene", sorter: (a, b) => a.gene.localeCompare(b.gene) },
    { title: "Consequence", dataIndex: "consequence", sorter: (a, b) => a.consequence.localeCompare(b.consequence) },
    { title: "Position", dataIndex: "position" },
    { title: "Carriers", dataIndex: "carriers", sorter: (a, b) => (a.carriers ?? 0) - (b.carriers ?? 0), defaultSortOrder: "descend" },
    { title: "Tree site", dataIndex: "tree_site" },
    { title: "Best clade", dataIndex: "best_clade" },
    { title: "Clade F1", dataIndex: "clade_f1", sorter: (a, b) => (a.clade_f1 ?? -1) - (b.clade_f1 ?? -1), render: (x) => fmt(x) },
    { title: "Signature", dataIndex: "signature", render: (x, r) => (x ? `${x}${Number.isFinite(r.signature_prob) ? ` (p=${fmt(r.signature_prob)})` : ""}` : "") },
  ];
  return (
    <Card
      size="small"
      className="sc-isolate-panel"
      title={
        <Space wrap size={8}>
          <b>{`Isolated mutations: ${columns.length} of ${annot?.n ?? "?"} sites`}</b>
          {carrierCount != null && <Tag>{`${carrierCount} carrier cells highlighted`}</Tag>}
          {branchInfo && <Tag color="purple">{`${branchInfo.sites} sites on ${branchInfo.branches} branches (counts on the tree)`}</Tag>}
        </Space>
      }
      extra={
        <Button size="small" icon={<DownloadOutlined />} onClick={() => download(`${patient || "snv"}_isolated_sites.tsv`, tableTsv(rows))}>
          TSV
        </Button>
      }
    >
      <div ref={ref} style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {cmp && (
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            <Text strong>Fit to the tree</Text>
            <div>
              <Text type="secondary">{`clade F1 of the isolated sites (blue) vs all sites (grey outline): median ${fmt(cmp.subsetMedian)} vs ${fmt(cmp.allMedian)}`}</Text>
            </div>
            <F1Histogram cmp={cmp} width={Math.max(280, Math.min(480, width / 2 - 20))} />
          </div>
        )}
        <div style={{ flex: "2 1 460px", minWidth: 320 }}>
          <Text strong>{`Fit to the signature${signature ? ` (${signature})` : ""}`}</Text>
          {fit ? (
            <>
              <div>
                <Text type="secondary">{`SBS96 spectrum of ${fit.used} isolated sites (bars) vs the ${signature} reference profile scaled to the same total (dots): cosine ${fmt(fit.cosine, 3)}. Assignment probability >= 0.5: ${fit.high} sites, lower: ${fit.low}.`}</Text>
              </div>
              <Profile counts={Array.from(fit.counts)} reconstruction={Array.from(fit.expected)} width={Math.max(320, Math.min(720, width - 20))} />
            </>
          ) : (
            <div><Text type="secondary">{model.ready ? "No signature assigned to the isolated sites." : "Loading the signature reference..."}</Text></div>
          )}
        </div>
      </div>
      <Table
        size="small"
        style={{ marginTop: 8 }}
        rowKey="c"
        dataSource={rows}
        columns={tableColumns}
        pagination={{ pageSize: 10, size: "small", showSizeChanger: false, hideOnSinglePage: true }}
      />
    </Card>
  );
}
