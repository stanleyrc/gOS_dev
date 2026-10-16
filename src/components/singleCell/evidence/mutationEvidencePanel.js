import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Card, Collapse, Empty, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { fmtLog10P, rankFindings, readEvidenceLink } from "../../../helpers/singleCell/siteEvidence";
import NotComputed, { pcFile } from "./notComputed";
import SiteEvidenceView from "./siteEvidenceView";

const { Text } = Typography;
const pct = (x) => (x == null ? "–" : `${Math.round(100 * x)}%`);
const TOP = 8;

/**
 * Mutation evidence: the patient's genotyped sites ranked by evidence (verdict, then known hotspot / GBM gene,
 * then signal) with the hotspots that were looked for and not found, and below it the single-site view of the
 * chosen site. ?evsite=<chrom:pos:REF>ALT> (with tab=15) opens a site directly.
 */
export default function MutationEvidencePanel({ siteId: siteProp = null, onSiteChange }) {
  const { cells, patient, precompute } = useSelector((s) => s.SingleCell);
  const calls = pcFile(precompute, "calls");
  const evidence = pcFile(precompute, "siteEvidence");
  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id ?? "unassigned"])), [cells]);
  const ranked = useMemo(() => (calls.ok ? rankFindings(calls.data, evidence.data, cloneOf) : null), [calls.ok, calls.data, evidence.data, cloneOf]);
  const [siteLocal, setSiteLocal] = useState(siteProp);
  const [userSite, setUserSite] = useState(null); // a site picked from the list inside the drawer overrides the driver's own site
  const siteId = userSite ?? siteProp ?? siteLocal;
  const pickSite = (id) => {
    setUserSite(id);
    if (onSiteChange) onSiteChange(id);
  };
  const setSiteId = (id) => {
    setSiteLocal(id);
    if (onSiteChange) onSiteChange(id);
  };
  const [showAll, setShowAll] = useState(false);

  // initial site: deep link, else the top finding
  useEffect(() => {
    if (!ranked) return;
    const known = (id) => ranked.all.some((f) => f.id === id);
    if (siteId && known(siteId)) return;
    const link = readEvidenceLink();
    const linked = link.site && (!link.report || link.report === `${patient?.caseReportId}`) && known(link.site) ? link.site : null;
    setSiteId(linked || ranked.findings[0]?.id || ranked.all[0]?.id || null);
  }, [ranked, siteId, patient]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!calls.ok) return <NotComputed what="Site genotypes" step="caller" status={calls.status} />;
  if (!ranked.all.length) return <Empty description="No genotyped sites for this patient" />;

  const rows = showAll ? ranked.all : ranked.findings.slice(0, TOP);
  const columns = [
    { title: "Verdict", key: "v", width: 118, render: (_, f) => <Tag color={f.verdict.color}>{f.verdict.label}</Tag> },
    {
      title: "Site",
      key: "site",
      width: 250,
      render: (_, f) => (
        <span>
          <Text strong>{f.name}</Text>
          {f.hotspot && (
            <Tag color="blue" style={{ marginLeft: 6 }}>
              hotspot
            </Tag>
          )}
          {!f.hotspot && f.eventTier && (
            <Tooltip title="SNV from the patient's filtered events, genotyped in every cell">
              <Tag style={{ marginLeft: 6 }}>tier {f.eventTier} event</Tag>
            </Tooltip>
          )}
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {f.chrom}:{Number(f.pos).toLocaleString()} {f.ref}&gt;{f.alt}
          </Text>
        </span>
      ),
    },
    { title: "Carrier cells", key: "c", width: 120, render: (_, f) => `${f.stats.carrierCells} / ${f.stats.coveredTumour} covered` },
    { title: "Tumour alt / total", key: "t", width: 150, render: (_, f) => `${f.stats.tumor.alt} / ${f.stats.tumor.dp} (${pct(f.stats.tVaf)})` },
    { title: "Normal alt / total", key: "n", width: 130, render: (_, f) => `${f.stats.normal.alt} / ${f.stats.normal.dp}` },
    { title: "p vs error", key: "p", width: 100, render: (_, f) => fmtLog10P(f.stats.log10pError) },
    {
      title: "Other patients",
      key: "o",
      width: 150,
      render: (_, f) => (f.stats.cohort.carriers.length ? <Text>also in {f.stats.cohort.carriers.join(", ")}</Text> : f.stats.cohort.rows.length ? <Text type="secondary">none</Text> : "–"),
    },
    { title: "Why", key: "w", width: 360, ellipsis: { showTitle: false }, render: (_, f) => <Tooltip title={f.verdict.summary} placement="topLeft">{f.verdict.summary}</Tooltip> },
  ];
  const hidden = ranked.findings.length - Math.min(TOP, ranked.findings.length);

  const findings = (
      <Card
        size="small"
        title={
          <span>
            Findings: mutations ranked by single-cell evidence{" "}
            <Text type="secondary" style={{ fontWeight: 400 }}>
              — {ranked.findings.filter((f) => f.verdict.level === "supported").length} supported of {ranked.all.length} sites genotyped
            </Text>
          </span>
        }
        extra={
          <Space size={4}>
            <Switch size="small" checked={showAll} onChange={setShowAll} />
            <Text>all {ranked.all.length} sites</Text>
          </Space>
        }
      >
        <Table
          size="small"
          rowKey="id"
          dataSource={rows}
          columns={columns}
          pagination={showAll ? { pageSize: 15, size: "small" } : false}
          scroll={{ x: 1300 }}
          rowClassName={(f) => (f.id === siteId ? "sc-row-active" : "")}
          onRow={(f) => ({ onClick: () => pickSite(f.id), style: { cursor: "pointer" } })}
        />
        <Space direction="vertical" size={2} style={{ marginTop: 8 }}>
          {!showAll && hidden > 0 && (
            <Text type="secondary">
              {hidden} more sites with alt reads (mostly artefact-like or weak) — switch on &quot;all sites&quot; to browse them.
            </Text>
          )}
          {ranked.negativeHotspots.length > 0 && (
            <div>
              <Text type="secondary">Hotspots genotyped and not detected: </Text>
              {ranked.negativeHotspots.map((f) => (
                <Tooltip key={f.id} title={f.verdict.summary}>
                  <Tag style={{ cursor: "pointer", marginBottom: 2 }} color={f.id === siteId ? "processing" : undefined} onClick={() => pickSite(f.id)}>
                    {f.name} · 0/{f.stats.tumor.dp}
                    {f.verdict.level === "uninformative" ? " (too few reads)" : ""}
                  </Tag>
                </Tooltip>
              ))}
            </div>
          )}
          {!evidence.ok && (
            <Text type="secondary">
              Read-level checks (strand, base quality, other patients) need precompute/site_evidence.json — not yet computed for this patient; verdicts use the
              caller&apos;s pooled counts only.
            </Text>
          )}
        </Space>
      </Card>
  );
  const siteView = siteId && <SiteEvidenceView key={siteId} siteId={siteId} calls={calls.data} evidence={evidence.data} />;
  // inside the driver drawer (site given) the selected site comes first and the patient-wide findings are a collapsed section at the bottom
  if (siteProp != null) {
    return (
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {siteView}
        <Collapse
          size="small"
          items={[{ key: "others", label: `Other sites in this patient (${ranked.all.length} genotyped, ${ranked.findings.length} with alt reads)`, children: findings }]}
        />
      </Space>
    );
  }
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {findings}
      {siteView}
    </Space>
  );
}
