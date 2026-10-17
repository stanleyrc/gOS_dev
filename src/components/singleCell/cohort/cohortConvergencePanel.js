import React, { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Select, Space, Switch, Table, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import { eventClass, isTertPromoterSv } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";
import HintLine, { Provenance } from "../hintLine";
import datasetsActions from "../../../redux/datasets/actions";
import settingsActions from "../../../redux/settings/actions";
import { CONV_PARAM, rankEventCandidates } from "../../../helpers/singleCell/convergenceEvidence";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", promoter: "#E7298A", complex: "#E66101", other: "#8c8c8c" };
const clonalityOf = (f) => (f >= 0.85 ? "clonal" : f >= 0.1 ? "subclonal" : "rare");

/**
 * Convergent evolution: genes altered in several patients, with the
 * clonality of the alteration in each (clonal / subclonal / rare) and the
 * alteration class. Genes that are truncal in some patients and subclonal
 * in others, or subclonal in several, are the parallel events.
 */
export default function CohortConvergencePanel({ summaries, files, onEvent }) {
  const { t } = useTranslation("common");
  const [maxTier, setMaxTier] = useState(2);
  const [strongOnly, setStrongOnly] = useState(true);
  const [minPatients, setMinPatients] = useState(2);
  const rows = useMemo(() => {
    const byGene = new Map();
    summaries.forEach((s) => {
      (files[s.caseReportId]?.events || []).forEach((e) => {
        if (Number(e.Tier ?? 9) > maxTier || (strongOnly && !isStrongEvent(e))) return;
        const gene = isTertPromoterSv(e) ? "TERT" : `${e.gene || e.fusion_genes || ""}`.split("::")[0];
        if (!gene) return;
        const f = Number(e.cell_fraction) || 0;
        if (!byGene.has(gene)) byGene.set(gene, new Map());
        const m = byGene.get(gene);
        const cur = m.get(s.caseReportId);
        if (!cur || f > cur.fraction) m.set(s.caseReportId, { fraction: f, cls: eventClass(e), event: e, summary: s });
      });
    });
    return [...byGene.entries()]
      .map(([gene, m]) => {
        const per = [...m.values()];
        const clon = per.map((p) => clonalityOf(p.fraction));
        return {
          gene,
          nPatients: per.length,
          nClonal: clon.filter((c) => c === "clonal").length,
          nSubclonal: clon.filter((c) => c === "subclonal").length,
          classes: [...new Set(per.map((p) => p.cls))],
          per: m,
          pattern: clon.every((c) => c === "clonal") ? "truncal-everywhere" : clon.filter((c) => c === "subclonal").length >= 2 ? "parallel-subclonal" : clon.includes("clonal") && clon.includes("subclonal") ? "mixed" : "other",
        };
      })
      .filter((r) => r.nPatients >= minPatients)
      .sort((a, b) => b.nPatients - a.nPatients || b.nSubclonal - a.nSubclonal || a.gene.localeCompare(b.gene));
  }, [summaries, files, maxTier, strongOnly, minPatients]);
  // per patient: filtered events whose carriers form >= 2 clades on the patient's tree (candidates for the patient Convergence panel)
  const dispatch = useDispatch();
  const candidates = useMemo(() => {
    const out = [];
    summaries.forEach((s) => {
      const f = files[s.caseReportId];
      if (!f?.tree || !f?.events) return;
      const evs = f.events.filter((e) => Number(e.Tier ?? 9) <= maxTier && (!strongOnly || isStrongEvent(e)));
      rankEventCandidates(evs, f.tree)
        .filter((c) => c.nGroups >= 2)
        .forEach((c) => out.push({ ...c, patient: s.caseReportId, summary: s, rowKey: `${s.caseReportId}|${c.key}` }));
    });
    return out.sort((a, b) => b.nGroups - a.nGroups || a.tier - b.tier || b.carriers - a.carriers);
  }, [summaries, files, maxTier, strongOnly]);
  const openInPatient = (c) => {
    const url = new URL(window.location.href);
    url.searchParams.set("report", c.patient);
    url.searchParams.set("tab", "7");
    url.searchParams.set(CONV_PARAM, `ev:${c.key}`);
    window.history.replaceState(window.history.state, "", url.toString());
    dispatch(datasetsActions.openCaseReport(c.summary.record.datasetId, c.patient, { allowNewTab: true }));
    dispatch(settingsActions.updateTab("7"));
  };
  const pct = d3.format(".0%");
  const columns = [
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", width: 130, render: (g, r) => <Space size={4} style={{ whiteSpace: "nowrap" }}>{r.classes.map((c) => <span key={c} style={{ width: 8, height: 8, borderRadius: 2, background: CLASS_COLORS[c], display: "inline-block" }} />)}<Text strong>{g}</Text></Space> },
    { title: t("components.single-cell.cohort.conv-pattern"), dataIndex: "pattern", width: 170, filters: ["truncal-everywhere", "parallel-subclonal", "mixed", "other"].map((p) => ({ text: t(`components.single-cell.cohort.conv-${p}`), value: p })), onFilter: (v, r) => r.pattern === v, render: (p) => <Text strong={p === "parallel-subclonal"} type={p === "other" ? "secondary" : undefined}>{t(`components.single-cell.cohort.conv-${p}`)}</Text> },
    { title: t("components.single-cell.cohort.patients"), dataIndex: "nPatients", width: 90, sorter: (a, b) => a.nPatients - b.nPatients },
    ...summaries.map((s) => ({
      title: s.caseReportId,
      key: s.caseReportId,
      width: 130,
      render: (_, r) => {
        const p = r.per.get(s.caseReportId);
        if (!p) return <Text type="secondary">–</Text>;
        const c = clonalityOf(p.fraction);
        return (
          <button type="button" className="sc-text-button" onClick={() => onEvent && onEvent(p.summary, p.event)}>
            <Text strong={c === "clonal"} type={c === "rare" ? "secondary" : undefined}>{`${t(`components.single-cell.cohort.conv-${c}`)} ${pct(p.fraction)}`}</Text>
          </button>
        );
      },
    })),
  ];
  return (
    <Card
      size="small"
      title={<Space><BranchesOutlined />{t("components.single-cell.cohort.conv-title", { count: rows.length })}<Provenance id="oncoprint" /></Space>}
      extra={
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.cohort.oncoprint-tier")}</Text>
          <Select size="small" value={maxTier} onChange={setMaxTier} style={{ width: 80 }} options={[1, 2, 3].map((v) => ({ value: v, label: `≤ ${v}` }))} />
          <Text type="secondary">{t("components.single-cell.cohort.conv-min")}</Text>
          <Select size="small" value={minPatients} onChange={setMinPatients} style={{ width: 70 }} options={[1, 2, 3, 4].map((v) => ({ value: v, label: `≥ ${v}` }))} />
          <Switch size="small" checked={strongOnly} onChange={setStrongOnly} />
          <Text>{t("components.single-cell.events.strong-only")}</Text>
        </Space>
      }
      bodyStyle={{ padding: 0 }}
    >
      <Table size="small" className="sc-events-table" rowKey="gene" columns={columns} dataSource={rows} pagination={{ pageSize: 15, size: "small" }} scroll={{ x: true }} />
      <HintLine text={t("components.single-cell.cohort.conv-help")} />
      <div style={{ padding: "8px 12px 0" }}>
        <Text strong>{`Within-patient candidates (${candidates.length}): events whose carriers form ≥ 2 clades on the patient's tree`}</Text>
      </div>
      <Table
        size="small"
        className="sc-events-table"
        rowKey="rowKey"
        dataSource={candidates}
        pagination={{ pageSize: 10, size: "small" }}
        locale={{ emptyText: "No events with two or more carrier groups at these filters" }}
        columns={[
          { title: "Patient", dataIndex: "patient", width: 110, filters: [...new Set(candidates.map((c) => c.patient))].map((p) => ({ text: p, value: p })), onFilter: (v, r) => r.patient === v },
          { title: "Event", dataIndex: "label", render: (l) => <Text strong>{l}</Text> },
          { title: "Tier", dataIndex: "tier", width: 60 },
          { title: "Carrier groups", dataIndex: "nGroups", width: 110, sorter: (a, b) => a.nGroups - b.nGroups },
          { title: "Group sizes", dataIndex: "sizes", render: (z) => z.join(", ") },
          { title: "Carriers", dataIndex: "carriers", width: 90 },
          {
            title: "",
            key: "open",
            width: 130,
            render: (_, c) => (
              <button type="button" className="sc-text-button" onClick={() => openInPatient(c)}>
                open in patient ›
              </button>
            ),
          },
        ]}
      />
      <HintLine text="Carrier groups: maximal tree clades of ≥ 3 cells with ≥ 80% carriers (normal cells not removed here). Open in patient shows the groups, the CN at the event and the SNVs that place a group with non-carriers (Single-Cell tab, Convergent evolution)." />
    </Card>
  );
}
