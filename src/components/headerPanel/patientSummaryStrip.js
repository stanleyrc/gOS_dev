import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { Space, Tag, Tooltip, Typography } from "antd";
import { legendColors } from "../../helpers/utility";
import useCohortExport from "../singleCell/cohort/useCohortExport";
import {
  countFlagged,
  countTumorNormal,
  describeTree,
  summarizeQc,
  summarizeTmb,
} from "../../helpers/singleCell/patientSummary";
import QuantileLegend from "./quantileLegend";

const { Text } = Typography;

const NA = ({ why }) => <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>{`not available (${why})`}</Text>;
const fmt = (v, digits = 2) => (v == null ? null : Number(v).toLocaleString("en-US", { maximumFractionDigits: digits }));

function Item({ label, tip, children }) {
  return (
    <Tooltip title={tip} placement="bottom">
      <div className="sc-summary-item" style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--sc-muted, #8c8c8c)", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{children}</div>
      </div>
    </Tooltip>
  );
}

const classColor = (cls) => (cls == null ? undefined : legendColors()[cls]);

/**
 * Summary strip at the top of a single-cell patient report: tumor / normal cells, TMB (truncal per Mb, median
 * subclonal per cell, colored by the cohort quantile), the tree in use and key QC medians. Everything is read from
 * data the page already loads (_cohort/tmb.json, precompute/qc.json, the cell manifest, the tree).
 */
export default function PatientSummaryStrip({ metadata }) {
  const dataset = useSelector((s) => s.Settings.dataset);
  const sc = useSelector((s) => s.SingleCell);
  const tmbDoc = useCohortExport(dataset, "tmb.json");
  const pair = metadata?.pair;
  const ready = sc.patient && sc.patient.caseReportId === pair && !sc.loading;
  const cells = ready ? sc.cells : [];
  const qcRows = sc.precompute?.qc?.status === "ok" ? sc.precompute.qc.data?.cells || [] : [];

  const counts = useMemo(() => countTumorNormal(cells, qcRows), [cells, qcRows]);
  const qc = useMemo(() => summarizeQc(qcRows), [qcRows]);
  const flagged = useMemo(() => countFlagged(cells), [cells]);
  const tmb = useMemo(() => summarizeTmb(tmbDoc.data, pair), [tmbDoc.data, pair]);
  const tree = useMemo(() => describeTree(sc.tree?.method, metadata), [sc.tree, metadata]);

  if (!ready) return null;
  const usesQuantile = tmb && (tmb.truncalClass != null || tmb.subclonalClass != null);
  const qcWhy = sc.precompute?.qc?.status === "ok" ? "no tumor cells in qc.json" : "precompute/qc.json not exported for this patient";
  const tmbWhy = tmbDoc.status === "loading" ? "loading" : tmbDoc.status === "none" ? "_cohort/tmb.json not exported" : "no SNV calls for this patient yet";

  return (
    <div className="sc-patient-summary" data-testid="sc-patient-summary" style={{ marginTop: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, max-content))", gap: "6px 28px", alignItems: "start" }}>
        <Item label="Cells" tip={`${counts.tumor} tumor and ${counts.normal} normal cells in the manifest`}>
          {fmt(counts.total, 0)} <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{`${counts.tumor} T / ${counts.normal} N`}</Text>
        </Item>
        <Item
          label="Truncal SNVs / Mb"
          tip={tmb ? `Dropout-corrected truncal SNV sites per callable Mb${tmb.truncalSites != null ? ` (${tmb.truncalSites.toLocaleString("en-US")} sites)` : ""}. Colored by its quantile among ${tmb.nCohort} patients with SNV calls.` : undefined}
        >
          {tmb?.truncalPerMb != null ? <span style={{ color: classColor(tmb.truncalClass) }}>{fmt(tmb.truncalPerMb)}</span> : <NA why={tmbWhy} />}
        </Item>
        <Item
          label="Subclonal SNVs / cell"
          tip={tmb ? `Median over tumor cells of the subclonal SNVs each cell carries${tmb.noisy ? " (patient flagged noisy: an upper bound)" : ""}. Colored by its quantile among ${tmb.nCohort} patients.` : undefined}
        >
          {tmb?.subclonalPerCell != null ? (
            <span style={{ color: classColor(tmb.subclonalClass) }}>{`median ${fmt(tmb.subclonalPerCell, 0)}`}{tmb.noisy ? " (noisy)" : ""}</span>
          ) : (
            <NA why={tmbWhy} />
          )}
        </Item>
        <Item label="Tree" tip={tree?.detail}>
          {tree ? <Tag color={tree.label.startsWith("older") ? "gold" : tree.label.startsWith("included") ? "green" : "default"} style={{ margin: 0 }}>{tree.label}</Tag> : <NA why="no tree file and nothing to infer one from" />}
        </Item>
        <Item label="Median het-site depth" tip="Median over tumor cells of the read depth at germline heterozygous sites (precompute/qc.json)">
          {qc?.hetDepth != null ? `${fmt(qc.hetDepth, 1)}x` : <NA why={qcWhy} />}
        </Item>
        <Item label="Median MAPD" tip="Median absolute pairwise difference of 500 kb bin coverage over tumor cells; lower is cleaner (precompute/qc.json)">
          {qc?.mapd != null ? fmt(qc.mapd, 3) : <NA why={qcWhy} />}
        </Item>
        <Item label="Median het sites / cell" tip="Median over tumor cells of the germline heterozygous sites with usable reads (precompute/qc.json)">
          {qc?.hetSites != null ? fmt(qc.hetSites, 0) : <NA why={qcWhy} />}
        </Item>
        <Item label="Flagged cells" tip="Cells with a QC flag (doublet, high allelic dropout, high MAPD, CN not integer) or failing the coverage QC thresholds">
          {flagged.assessed ? `${fmt(flagged.flagged, 0)} of ${fmt(flagged.assessed, 0)}` : <NA why="no per-cell QC flags exported" />}
        </Item>
      </div>
      {usesQuantile ? (
        <div style={{ marginTop: 4 }}>
          <QuantileLegend what={`Cohort quantile of TMB (${tmb.nCohort} patients)`} />
        </div>
      ) : null}
    </div>
  );
}
