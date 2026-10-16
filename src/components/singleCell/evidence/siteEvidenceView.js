import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Card, Col, Row, Segmented, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, InfoCircleFilled, LinkOutlined, MinusCircleOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import {
  PRESET_LABELS,
  annotateSite,
  cloneLanes,
  decodeReads,
  evidenceLinkQuery,
  fmtLog10P,
  siteCells,
  siteStats,
  siteVerdict,
} from "../../../helpers/singleCell/siteEvidence";
import usePlotTheme from "../usePlotTheme";
import CloneLanesPlot from "./cloneLanesPlot";
import SiteReadsPanel from "./siteReadsPanel";
import useContainerWidth from "../useContainerWidth";

const { Text, Title, Paragraph } = Typography;
const pct = (x) => (x == null ? "–" : `${Math.round(100 * x)}%`);

function CheckIcon({ status, pt }) {
  if (status === "pass") return <CheckCircleFilled style={{ color: pt.ok }} />;
  if (status === "fail") return <CloseCircleFilled style={{ color: pt.danger }} />;
  if (status === "warn") return <ExclamationCircleFilled style={{ color: pt.warn }} />;
  if (status === "info") return <InfoCircleFilled style={{ color: pt.accent }} />;
  return <MinusCircleOutlined style={{ color: pt.faint }} />;
}

/**
 * One site, answering "is this mutation real, and in which cells?": annotation and verdict with its checks,
 * the reads of every cell laid out by clone (coverage and dropout explicit), pooled tumour vs normal counts
 * under three read filters with the cross-patient background, and the reads themselves.
 */
export default function SiteEvidenceView({ siteId, calls, evidence }) {
  const dispatch = useDispatch();
  const pt = usePlotTheme();
  const { cells, cloneColors, order, patient, selectedCellIds } = useSelector((s) => s.SingleCell);
  const dataset = useSelector((s) => s.Settings.dataset);
  const [preset, setPreset] = useState("caller");
  const [copied, setCopied] = useState(false);
  const [viewRef, viewWidth] = useContainerWidth(900);
  const wide = viewWidth >= 1400;

  const site = (calls?.sites || []).find((s) => s.id === siteId);
  const ev = evidence?.sites?.[siteId] || null;
  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id ?? "unassigned"])), [cells]);
  const cellRows = useMemo(() => siteCells(calls, siteId, cloneOf), [calls, siteId, cloneOf]);
  const lanes = useMemo(() => cloneLanes(cellRows, order), [cellRows, order]);
  const ann = site ? annotateSite(site, ev) : null;
  const stats = useMemo(() => (site ? siteStats(site, ev, cellRows, { preset: ev?.presets?.[preset] ? preset : "caller" }) : null), [site, ev, cellRows, preset]);
  const verdict = useMemo(() => (stats ? siteVerdict(stats) : null), [stats]);
  const reads = useMemo(() => decodeReads(ev, calls?.cells || [], cloneOf), [ev, calls, cloneOf]);
  const presetRows = useMemo(
    () =>
      site
        ? ["caller", "strict", "all"]
            .filter((k) => ev?.presets?.[k] || k === "caller")
            .map((k) => {
              const s = siteStats(site, ev, cellRows, { preset: k });
              return { key: k, ...s, verdict: siteVerdict(s) };
            })
        : [],
    [site, ev, cellRows]
  );
  const selected = useMemo(() => new Set(selectedCellIds.map(String)), [selectedCellIds]);

  if (!site) return null;
  const t = stats.tumor;
  const n = stats.normal;
  const toggle = (id) => {
    const next = selected.has(id) ? selectedCellIds.filter((c) => `${c}` !== id) : [...selectedCellIds, id];
    dispatch(singleCellActions.updateSelection(next));
  };
  const selectCarriers = () => dispatch(singleCellActions.updateSelection(cellRows.filter((c) => c.alt > 0).map((c) => c.id)));
  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}${evidenceLinkQuery({ dataset: dataset?.id, report: patient?.caseReportId, site: siteId })}`;
    try {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      window.prompt("Link to this site", url); // eslint-disable-line no-alert
    }
  };

  return (
    <div ref={viewRef} style={{ width: "100%" }}>
    <Space direction="vertical" size="middle" style={{ width: "100%" }} className="sc-site-evidence">
      <Card size="small" className="sc-site-head">
        <Space direction="vertical" size={6} style={{ width: "100%" }}>
          <Space wrap align="center" size={[10, 4]} style={{ justifyContent: "space-between", width: "100%" }}>
            <Space wrap align="center" size={[10, 4]}>
              <Tag color={verdict.color} style={{ fontSize: 14, padding: "2px 10px", marginRight: 0 }}>
                {verdict.label}
              </Tag>
              <Title level={4} style={{ margin: 0 }}>
                {ann.name}
              </Title>
              <Text type="secondary" copyable={{ text: `${site.chrom}:${site.pos}` }}>
                {site.chrom}:{Number(site.pos).toLocaleString()} {site.ref}&gt;{site.alt}
              </Text>
              {ann.configured ? <Tag>hotspot genotyped in every cell</Tag> : ann.eventTier ? <Tag>tier {ann.eventTier} filtered event, genotyped in every cell</Tag> : <Tag>discovered from pooled reads</Tag>}
            </Space>
            <Space size={6} wrap>
              <Text type="secondary">read filter</Text>
              <Segmented
                size="small"
                value={preset}
                onChange={setPreset}
                options={["caller", "strict", "all"].map((k) => ({ value: k, label: k, disabled: !ev?.presets?.[k] && k !== "caller" }))}
              />
              <Tooltip title="Select the carrier cells (shared with the heatmap, UMAP and other tabs)">
                <Button size="small" onClick={selectCarriers} disabled={!stats.carrierCells}>
                  select {stats.carrierCells} carriers
                </Button>
              </Tooltip>
              <Tooltip title={copied ? "Copied" : "Copy a link that opens this site"}>
                <Button size="small" icon={<LinkOutlined />} onClick={copyLink} />
              </Tooltip>
            </Space>
          </Space>
          {(ann.where || ann.note) && (
            <Paragraph style={{ margin: 0 }}>
              {ann.where && <Text strong>{ann.where}. </Text>}
              {ann.note}
            </Paragraph>
          )}
          <Text style={{ fontSize: 15 }}>
            <Text strong>Verdict: </Text>
            {verdict.summary}
          </Text>
          <Row gutter={[16, 8]} style={{ marginTop: 4 }}>
            <Col xs={12} md={6} xl={4}>
              <Statistic title="Carrier cells" value={stats.carrierCells} suffix={<Text type="secondary" style={{ fontSize: 14 }}>/ {stats.coveredTumour} covered</Text>} />
            </Col>
            <Col xs={12} md={6} xl={4}>
              <Statistic
                title="Tumour reads (alt / total)"
                value={`${t.alt} / ${t.dp}`}
                suffix={<Text type="secondary" style={{ fontSize: 14 }}>VAF {pct(stats.tVaf)}</Text>}
              />
            </Col>
            <Col xs={12} md={6} xl={4}>
              <Statistic title="Normal reads (alt / total)" value={`${n.alt} / ${n.dp}`} suffix={<Text type="secondary" style={{ fontSize: 14 }}>{stats.coveredNormal} cells</Text>} />
            </Col>
            <Col xs={12} md={6} xl={4}>
              <Statistic title={`p (tumour vs ${(100 * stats.errorRate).toFixed(1)}% error)`} value={fmtLog10P(stats.log10pError)} />
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Statistic
                title="Coverage (dropout)"
                value={`${stats.coveredTumour} of ${stats.nTumourCells}`}
                suffix={
                  <Text type="secondary" style={{ fontSize: 14 }}>
                    tumour cells have reads ({pct(stats.nTumourCells ? stats.coveredTumour / stats.nTumourCells : null)})
                  </Text>
                }
              />
            </Col>
          </Row>
          <div className="sc-site-checks">
            {verdict.checks.map((c) => (
              <div key={c.key} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "2px 0" }}>
                <CheckIcon status={c.status} pt={pt} />
                <Text>{c.text}</Text>
              </div>
            ))}
            {stats.reads && (
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "2px 0" }}>
                <MinusCircleOutlined style={{ color: pt.faint }} />
                <Text type="secondary">
                  {stats.reads.sampleEvery > 1 ? `Deep site: every ${stats.reads.sampleEvery}th read used, ` : ""}
                  {stats.reads.total} reads overlap the site in the slice BAM: {stats.reads.dup} duplicates, {stats.reads.lowMq} with MAPQ &lt; 20
                  {stats.reads.unassigned ? `, ${stats.reads.unassigned} without a cell` : ""}; counts above use the {PRESET_LABELS[stats.preset] || "caller's totals"}.
                </Text>
              </div>
            )}
          </div>
        </Space>
      </Card>

      <Card
        size="small"
        title={
          <span>
            Which cells: reads at the site per cell, by clone{" "}
            <Text type="secondary" style={{ fontWeight: 400 }}>
              — {stats.carrierCells} carriers in {stats.clonesWithCarriers.length} of {stats.clonesCovered.length} covered tumour clones
            </Text>
          </span>
        }
      >
        <CloneLanesPlot lanes={lanes} cloneColors={cloneColors} selected={selected} onToggle={toggle} />
      </Card>

      <Card size="small" title="Pooled pseudo-bulk: tumour vs normal cells">
        <Row gutter={16}>
          <Col span={24} xl={wide ? 15 : 24}>
            <Table
              size="small"
              className="sc-nowrap-head"
              rowKey="key"
              pagination={false}
              dataSource={presetRows}
              rowClassName={(r) => (r.key === preset ? "sc-row-active" : "")}
              onRow={(r) => ({ onClick: () => setPreset(r.key), style: { cursor: "pointer" } })}
              scroll={{ x: 900 }}
              columns={[
                { title: "Read filter", dataIndex: "key", width: 110, render: (k) => <Tooltip title={PRESET_LABELS[k]}>{k}</Tooltip> },
                { title: "Tumour alt / total", key: "t", render: (_, r) => `${r.tumor.alt} / ${r.tumor.dp} (${pct(r.tVaf)})` },
                { title: "Alt fwd / rev", key: "s", render: (_, r) => (r.tumor.altF == null ? "–" : `${r.tumor.altF} / ${r.tumor.altR}`) },
                { title: "Normal alt / total", key: "n", render: (_, r) => `${r.normal.alt} / ${r.normal.dp}` },
                { title: "p vs error", key: "p", render: (_, r) => fmtLog10P(r.log10pError) },
                { title: "p tumour > normal", key: "f", render: (_, r) => (r.normal.dp ? fmtLog10P(r.log10pNormal) : "–") },
                { title: "Verdict", key: "v", width: 110, render: (_, r) => <Tag color={r.verdict.color}>{r.verdict.label}</Tag> },
              ]}
            />
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              p vs error: one-sided binomial of tumour alt reads against the larger of the normal-cell error ({(100 * stats.callerError).toFixed(2)}%) and the
              alt rate in patients without the mutation{stats.bgRate != null ? ` (${(100 * stats.bgRate).toFixed(2)}%)` : ""}. p tumour &gt; normal: one-sided Fisher exact
              test. Base quality: alt {stats.bqAlt ?? "–"} vs ref {stats.bqRef ?? "–"}.
            </Text>
          </Col>
          <Col span={24} xl={wide ? 9 : 24} style={wide ? undefined : { marginTop: 12 }}>
            <Text strong>Same site in the other patients</Text>
            {stats.cohort.rows.length ? (
              <Table
                size="small"
                rowKey="patient"
                pagination={false}
                dataSource={stats.cohort.rows}
                columns={[
                  { title: "Patient", dataIndex: "patient" },
                  { title: "Alt / total", key: "a", render: (_, r) => `${r.alt} / ${r.dp}` },
                  { title: "Mutant cells", dataIndex: "nMut" },
                  { title: "", key: "c", render: (_, r) => (r.carrier ? <Tag color="red">carrier</Tag> : <Tag>background</Tag>) },
                ]}
              />
            ) : (
              <div>
                <Text type="secondary">Not genotyped in other patients (site discovered in this patient only).</Text>
              </div>
            )}
          </Col>
        </Row>
      </Card>

      <Card size="small" title="Reads: pooled carrier, other tumour and normal cells">
        <SiteReadsPanel
          site={site}
          cellRows={cellRows}
          reads={reads}
          dataset={dataset}
          patient={patient}
          bamFile={evidence?.source?.bam?.replace(/^slices\//, "") || "drivers.dna.bam"}
          cloneColors={cloneColors}
        />
      </Card>
    </Space>
    </div>
  );
}
