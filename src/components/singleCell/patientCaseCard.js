import React, { useEffect, useMemo, useState } from "react";
import { Card, Space, Tag, Tooltip, Typography } from "antd";
import { casePath, tryGet } from "../../redux/singleCell/loaders";
import useCohortExport from "./cohort/useCohortExport";
import { cardTmb, cardVignette, keyDrivers, parseClones, treeSource, tumourClones } from "../../helpers/singleCell/patientCard";

const { Text } = Typography;
const eventsCache = new Map();
const loadEvents = (dataset, pair) => {
  const key = `${dataset.dataPath}|${pair}`;
  if (!eventsCache.has(key)) {
    const p = tryGet(casePath(dataset, pair, "filtered.events.json")).then((r) => (r.status === "ok" && Array.isArray(r.data) ? r.data : null));
    p.catch(() => eventsCache.delete(key));
    eventsCache.set(key, p);
  }
  return eventsCache.get(key);
};

const NA = ({ why }) => <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>{`not available (${why})`}</Text>;

function Stat({ label, children, tip }) {
  return (
    <Tooltip title={tip} placement="top">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--sc-muted, #8c8c8c)", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{children}</div>
      </div>
    </Tooltip>
  );
}

/**
 * Compact home-page card for a single-cell patient: cells, clones, tree source, TMB, RNA cells, key drivers and a
 * one-line headline. Replaces the bulk-WGS card (SV count, TMB, coverage, purity/ploidy are all N/A here).
 */
export default function PatientCaseCard({ record, dataset, onClick }) {
  const pair = record.caseReportId || record.pair;
  const vig = useCohortExport(dataset, "vignettes.json");
  const tmbDoc = useCohortExport(dataset, "tmb.json");
  const [events, setEvents] = useState(undefined);
  useEffect(() => {
    let live = true;
    if (!dataset?.dataPath) return undefined;
    loadEvents(dataset, pair).then((e) => live && setEvents(e)).catch(() => live && setEvents(null));
    return () => {
      live = false;
    };
  }, [dataset, pair]);

  const clones = useMemo(() => parseClones(record.summary), [record.summary]);
  const tumour = tumourClones(clones);
  const tree = treeSource(record);
  const v = useMemo(() => cardVignette(vig.data, pair), [vig.data, pair]);
  const tmb = useMemo(() => cardTmb(tmbDoc.data, pair), [tmbDoc.data, pair]);
  const drivers = useMemo(() => keyDrivers(events, 3), [events]);
  const normalFromClones = clones.filter((c) => /^normal$/i.test(c.name)).reduce((s, c) => s + c.n, 0);
  const nCells = record.cell_count ?? v?.nCells;
  const nNormal = v?.nNormal ?? normalFromClones;
  const nTumor = v?.nTumor ?? (nCells != null ? nCells - nNormal : null);

  return (
    <Card
      className="case-report-card sc-patient-card"
      hoverable
      onClick={onClick}
      variant="borderless"
      size="small"
      style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 } }}
      title={
        <Space size={8}>
          <Text strong style={{ fontSize: 16 }}>{pair}</Text>
          <Text type="secondary">{[record.tumor_type, record.disease, record.primary_site].filter(Boolean).filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).join(" · ")}</Text>
        </Space>
      }
    >
      {v?.headline ? (
        <Tooltip title={v.headline.text} overlayStyle={{ maxWidth: 520 }}>
          <div style={{ fontSize: 14, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            <Text strong>{v.headline.short}</Text>
            <Text type="secondary">{`: ${v.headline.text}`}</Text>
          </div>
        </Tooltip>
      ) : vig.status === "loading" ? null : (
        <NA why="no vignette headline for this patient" />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "8px 12px" }}>
        <Stat label="Cells" tip={`${nTumor ?? "?"} tumour, ${nNormal ?? "?"} normal`}>
          {nCells ?? "n/a"} <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{nTumor != null ? `${nTumor} T / ${nNormal} N` : ""}</Text>
        </Stat>
        <Stat label="Clones" tip={tumour.length ? tumour.map((c) => `${c.name}: ${c.n} cells`).join("\n") : undefined}>
          {tumour.length ? <span style={{ cursor: "help" }}>{tumour.length}</span> : <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>none called</Text>}
        </Stat>
        <Stat label="TMB" tip="Median per-cell mutations per Mb (single-cell, QC-corrected); _cohort/tmb.json">
          {tmb ? <>{tmb.value.toFixed(2)}<Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}> /Mb{tmb.noisy ? " (noisy)" : ""}</Text></> : <NA why="no SNV calls for this patient yet" />}
        </Stat>
        <Stat label="RNA cells" tip="Cells with matched single-cell RNA">
          {v?.nRna != null ? v.nRna : <NA why="vignettes.json" />}
        </Stat>
      </div>
      <div>
        <div style={{ fontSize: 12, color: "var(--sc-muted, #8c8c8c)", textTransform: "uppercase", letterSpacing: 0.3 }}>Key drivers (tier 1)</div>
        {events === undefined ? null : drivers.length ? (
          <Space size={[4, 4]} wrap style={{ marginTop: 2 }}>
            {drivers.map((d) => <Tooltip key={d.label} title={`${Math.round(100 * d.fraction)}% of tumour cells`}><Tag color="volcano" style={{ margin: 0, fontSize: 13 }}>{`${d.label} ${d.cls}`}</Tag></Tooltip>)}
          </Space>
        ) : (
          <div><NA why={events === null ? "filtered.events.json" : "no tier-1 event"} /></div>
        )}
      </div>
      <div style={{ marginTop: "auto" }}>
        <Tooltip title={tree.file ? `${tree.file}${tree.noSnvs ? ": no SNVs on this tree yet; it will be replaced by the genotyping-pipeline tree" : ""}` : undefined}>
          <Tag color={tree.kind === "current" ? "green" : tree.kind === "older" ? "gold" : "default"} style={{ margin: 0 }}>
            {tree.kind === "current" ? "Tree: included" : tree.kind === "older" ? `Tree: older${tree.noSnvs ? ", no SNVs yet" : ""}` : "Tree: not available"}
          </Tag>
        </Tooltip>
      </div>
    </Card>
  );
}
