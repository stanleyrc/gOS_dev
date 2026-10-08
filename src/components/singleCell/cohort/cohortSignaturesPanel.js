import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Segmented, Space, Table, Tag, Typography } from "antd";
import { BarChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { AetiologyLegend, setSignatureTheme, signatureColorOf } from "../signaturePanel";
import { SBS96, SBS_COLORS, cosine, sbs96Counts } from "../../../helpers/singleCell/signatures";
import { patientColor } from "./charts";
import CohortSignatureMatrix from "./cohortSignatureMatrix";
import signatureMetadata from "../../../translations/en/signatures.json";

const { Text } = Typography;
const SETS = ["truncal", "subclonal", "private"];
const pct = d3.format(".0%");
const aetiology = (sig) => (signatureMetadata.metadata[sig]?.full || "").replace(/<[^>]+>/g, "").replace(/^\S+\s*-\s*/, "");
const sortSigs = (a, b) => a.localeCompare(b, undefined, { numeric: true });

/** { signature: activity } of a named set of one patient's signatures.json. */
const setActivities = (file, name) => Object.fromEntries((file?.signatures?.sets?.find((x) => x.name === name)?.activities || []).map((a) => [a.signature, Number(a.activity) || 0]));
const setN = (file, name) => file?.signatures?.sets?.find((x) => x.name === name)?.n ?? d3.sum(Object.values(setActivities(file, name)));
const shares = (acts) => {
  const tot = d3.sum(Object.values(acts)) || 1;
  return Object.fromEntries(Object.entries(acts).map(([k, v]) => [k, v / tot]));
};

/** Stacked horizontal bar of signature activities; highlight dims the other signatures. */
function StackBar({ acts, x, y, width, height, mode, highlight, onHover, label }) {
  const total = d3.sum(Object.values(acts)) || 1;
  let cx = x;
  return (
    <g>
      {Object.entries(acts)
        .sort((a, b) => b[1] - a[1])
        .map(([sig, v]) => {
          const w = (v / total) * width;
          const el = (
            <g key={sig} onMouseEnter={() => onHover && onHover(sig)} onMouseLeave={() => onHover && onHover(null)}>
              <rect x={cx} y={y} width={Math.max(0, w - 0.6)} height={height} fill={signatureColorOf(sig)} opacity={highlight && highlight !== sig ? 0.25 : 1} rx={1} />
              {w > 36 && <text x={cx + w / 2} y={y + height / 2} dy="0.35em" textAnchor="middle" fontSize={10} fill="#fff" pointerEvents="none">{sig}</text>}
              <title>{`${label} · ${sig}: ${Math.round(v)} mutations (${pct(v / total)})${aetiology(sig) ? `\n${aetiology(sig)}` : ""}`}</title>
            </g>
          );
          cx += w;
          return el;
        })}
      {mode === "count" && <text x={x + width + 4} y={y + height / 2} dy="0.35em" fontSize={10} fill="#8c8c8c">{`n=${Math.round(total)}`}</text>}
    </g>
  );
}

/** Per patient: truncal / subclonal / private fits side by side (the signature evolution within each tumour). */
function EvolutionView({ summaries, files, width, mode, highlight, setHighlight, t }) {
  const LEFT = 150;
  const barW = Math.max(200, width - LEFT - 80);
  const rowH = 16;
  const groupH = SETS.length * (rowH + 3) + 14;
  const rows = summaries.filter((s) => SETS.some((n) => Object.keys(setActivities(files[s.caseReportId], n)).length));
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.signatures-empty")} />;
  return (
    <svg width={width} height={rows.length * groupH + 6}>
      {rows.map((s, i) => (
        <g key={s.caseReportId} transform={`translate(0,${i * groupH + 4})`}>
          <rect x={0} y={-2} width={4} height={groupH - 8} fill={patientColor(summaries.indexOf(s))} />
          <text x={10} y={6} dy="0.35em" fontSize={12} fontWeight={600} fill="#262626">{s.caseReportId}</text>
          {SETS.map((name, k) => {
            const acts = setActivities(files[s.caseReportId], name);
            const y = 14 + k * (rowH + 3);
            return (
              <g key={name}>
                <text x={LEFT - 6} y={y + rowH / 2} dy="0.35em" textAnchor="end" fontSize={10} fill="#595959">{t(`components.single-cell.cohort.sig-set-${name}`)}</text>
                {Object.keys(acts).length ? (
                  <StackBar acts={mode === "count" ? acts : shares(acts)} x={LEFT} y={y} width={mode === "count" ? (barW * d3.sum(Object.values(acts))) / Math.max(1, ...SETS.map((n) => d3.sum(Object.values(setActivities(files[s.caseReportId], n))))) : barW} height={rowH} mode={mode} highlight={highlight} onHover={setHighlight} label={`${s.caseReportId} ${name}`} />
                ) : (
                  <text x={LEFT} y={y + rowH / 2} dy="0.35em" fontSize={10} fill="#bfbfbf">–</text>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/** One small multiple per signature: truncal share → later share per patient. */
function SlopeView({ summaries, files, width, highlight, setHighlight, t }) {
  const data = useMemo(() => {
    const sigs = new Set();
    const per = summaries.map((s, k) => {
      const f = files[s.caseReportId];
      const truncal = shares(setActivities(f, "truncal"));
      const laterActs = setActivities(f, "subclonal");
      Object.entries(setActivities(f, "private")).forEach(([sig, v]) => (laterActs[sig] = (laterActs[sig] || 0) + v));
      const later = shares(laterActs);
      [...Object.keys(truncal), ...Object.keys(later)].forEach((x) => sigs.add(x));
      return { patient: s.caseReportId, k, truncal, later, has: Object.keys(truncal).length && Object.keys(later).length };
    });
    return { per: per.filter((p) => p.has), sigs: [...sigs].sort(sortSigs) };
  }, [summaries, files]);
  if (!data.per.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.signatures-empty")} />;
  const cellW = 150;
  const cellH = 130;
  const perRow = Math.max(1, Math.floor(width / cellW));
  const nRows = Math.ceil(data.sigs.length / perRow);
  const y = d3.scaleLinear().domain([0, 1]).range([cellH - 28, 18]);
  return (
    <svg width={width} height={nRows * cellH + 4}>
      {data.sigs.map((sig, i) => {
        const x0 = (i % perRow) * cellW;
        const y0 = Math.floor(i / perRow) * cellH;
        const vals = data.per.map((p) => ({ ...p, a: p.truncal[sig] || 0, b: p.later[sig] || 0 }));
        const meanA = d3.mean(vals, (v) => v.a);
        const meanB = d3.mean(vals, (v) => v.b);
        const dim = highlight && highlight !== sig;
        return (
          <g key={sig} transform={`translate(${x0},${y0})`} opacity={dim ? 0.3 : 1} onMouseEnter={() => setHighlight(sig)} onMouseLeave={() => setHighlight(null)}>
            <rect x={6} y={6} width={6} height={10} fill={signatureColorOf(sig)} />
            <text x={16} y={11} dy="0.35em" fontSize={12} fontWeight={600} fill="#262626">{sig}</text>
            <text x={cellW - 8} y={11} dy="0.35em" textAnchor="end" fontSize={10} fill={meanB - meanA > 0.05 ? "#d4380d" : meanB - meanA < -0.05 ? "#1d39c4" : "#8c8c8c"}>{d3.format("+.0%")(meanB - meanA)}</text>
            <line x1={40} x2={cellW - 40} y1={y(0)} y2={y(0)} stroke="#d9d9d9" />
            {[0.5, 1].map((v) => <text key={v} x={34} y={y(v)} dy="0.35em" textAnchor="end" fontSize={8} fill="#bfbfbf">{pct(v)}</text>)}
            {vals.map((v) => (
              <g key={v.patient}>
                <line x1={40} x2={cellW - 40} y1={y(v.a)} y2={y(v.b)} stroke={patientColor(v.k)} strokeWidth={1.6} />
                <circle cx={40} cy={y(v.a)} r={2.5} fill={patientColor(v.k)} />
                <circle cx={cellW - 40} cy={y(v.b)} r={2.5} fill={patientColor(v.k)} />
                <title>{`${v.patient} · ${sig}: ${pct(v.a)} truncal → ${pct(v.b)} later`}</title>
              </g>
            ))}
            <line x1={40} x2={cellW - 40} y1={y(meanA)} y2={y(meanB)} stroke="#262626" strokeWidth={2.4} strokeDasharray="4 3" />
            <text x={40} y={cellH - 14} textAnchor="middle" fontSize={9} fill="#8c8c8c">{t("components.single-cell.cohort.sig-set-truncal")}</text>
            <text x={cellW - 40} y={cellH - 14} textAnchor="middle" fontSize={9} fill="#8c8c8c">{t("components.single-cell.cohort.sig-later")}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 96-channel spectra per patient from the loaded SNV contexts, plus pairwise cosine similarity. */
function SpectraView({ summaries, files, width, t }) {
  const [category, setCategory] = useState("all");
  const spectra = useMemo(
    () =>
      summaries
        .map((s, k) => {
          const vars = (files[s.caseReportId]?.variants || []).filter((v) => v.context && (category === "all" || v.category === category));
          const { counts, used } = sbs96Counts(vars.map((v) => v.context));
          return { patient: s.caseReportId, k, counts, used };
        })
        .filter((s) => s.used > 0),
    [summaries, files, category]
  );
  if (!spectra.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.signatures.no-contexts")} />;
  const simW = Math.min(260, width * 0.3);
  const profW = width - simW - 24;
  const H = 86;
  const w = (profW - 30) / 96;
  const cell = Math.min(40, (simW - 60) / spectra.length);
  return (
    <div>
      <Space style={{ marginBottom: 6 }}>
        <Text type="secondary">{t("components.single-cell.cohort.sig-spectra-set")}</Text>
        <Segmented size="small" value={category} onChange={setCategory} options={[{ value: "all", label: t("components.single-cell.signatures.sites-all") }, ...SETS.map((n) => ({ value: n, label: t(`components.single-cell.cohort.sig-set-${n}`) }))]} />
      </Space>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <svg width={profW} height={spectra.length * (H + 10) + 14}>
          {Object.entries(SBS_COLORS).map(([sub, color], k) => (
            <g key={sub}>
              <rect x={30 + k * 16 * w} y={0} width={16 * w - 1} height={6} fill={color} />
              <text x={30 + (k + 0.5) * 16 * w} y={13} textAnchor="middle" fontSize={9} fill="#595959">{sub}</text>
            </g>
          ))}
          {spectra.map((s, i) => {
            const max = Math.max(1, ...s.counts);
            const y0 = 16 + i * (H + 10);
            return (
              <g key={s.patient} transform={`translate(0,${y0})`}>
                <text x={30} y={8} fontSize={11} fontWeight={600} fill={patientColor(s.k)}>{`${s.patient} · n=${s.used}`}</text>
                {SBS96.map((ch, c) => {
                  const h = (s.counts[c] / max) * (H - 14);
                  return <rect key={ch} x={30 + c * w} y={H - h} width={Math.max(1, w - 0.8)} height={h} fill={SBS_COLORS[ch.slice(2, 5)]}><title>{`${s.patient} ${ch}: ${s.counts[c]}`}</title></rect>;
                })}
                <line x1={30} x2={30 + 96 * w} y1={H} y2={H} stroke="#d9d9d9" />
              </g>
            );
          })}
        </svg>
        <svg width={simW} height={60 + spectra.length * cell + 10}>
          <text x={0} y={12} fontSize={11} fontWeight={600} fill="#262626">{t("components.single-cell.cohort.sig-similarity")}</text>
          {spectra.map((a, i) => (
            <g key={a.patient}>
              <text x={56} y={60 + (i + 0.5) * cell} dy="0.35em" textAnchor="end" fontSize={9} fill={patientColor(a.k)}>{a.patient}</text>
              <text transform={`translate(${60 + (i + 0.5) * cell},56) rotate(-45)`} fontSize={9} fill={patientColor(a.k)}>{a.patient}</text>
              {spectra.map((b, j) => {
                const v = cosine(a.counts, b.counts);
                return (
                  <g key={b.patient}>
                    <rect x={60 + j * cell} y={60 + i * cell} width={cell - 1} height={cell - 1} fill={d3.interpolateBlues(Math.max(0, (v - 0.5) * 2))} />
                    <text x={60 + (j + 0.5) * cell} y={60 + (i + 0.5) * cell} dy="0.35em" textAnchor="middle" fontSize={8} fill={v > 0.85 ? "#fff" : "#262626"}>{v.toFixed(2)}</text>
                    <title>{`cosine(${a.patient}, ${b.patient}) = ${v.toFixed(3)}`}</title>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/** Clone-level fits ("clone: X" sets) grouped by patient. */
function ClonesView({ summaries, files, width, mode, highlight, setHighlight, t }) {
  const LEFT = 170;
  const barW = Math.max(200, width - LEFT - 80);
  const groups = summaries
    .map((s, k) => ({ s, k, sets: (files[s.caseReportId]?.signatures?.sets || []).filter((x) => /^clone: /.test(x.name)) }))
    .filter((g) => g.sets.length);
  if (!groups.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.sig-clones-empty")} />;
  let y = 4;
  const blocks = groups.map((g) => {
    const top = y;
    y += 16 + g.sets.length * 18 + 10;
    return { ...g, top };
  });
  return (
    <svg width={width} height={y}>
      {blocks.map((g) => (
        <g key={g.s.caseReportId} transform={`translate(0,${g.top})`}>
          <rect x={0} y={0} width={4} height={12 + g.sets.length * 18} fill={patientColor(g.k)} />
          <text x={10} y={6} dy="0.35em" fontSize={12} fontWeight={600} fill="#262626">{g.s.caseReportId}</text>
          {g.sets.map((set, i) => {
            const acts = Object.fromEntries((set.activities || []).map((a) => [a.signature, Number(a.activity) || 0]));
            return (
              <g key={set.name}>
                <text x={LEFT - 6} y={16 + i * 18 + 7} dy="0.35em" textAnchor="end" fontSize={10} fill="#595959">{`${set.name.replace(/^clone: /, "")} (n=${set.n ?? Math.round(d3.sum(Object.values(acts)))})`}</text>
                <StackBar acts={mode === "count" ? acts : shares(acts)} x={LEFT} y={16 + i * 18} width={barW} height={14} mode="fraction" highlight={highlight} onHover={setHighlight} label={`${g.s.caseReportId} ${set.name}`} />
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/** Per-signature summary across patients. */
function SummaryTable({ summaries, files, t }) {
  const rows = useMemo(() => {
    const sigs = new Set();
    const per = summaries.map((s) => {
      const f = files[s.caseReportId];
      const all = shares(setActivities(f, "all"));
      const truncal = shares(setActivities(f, "truncal"));
      const laterActs = setActivities(f, "subclonal");
      Object.entries(setActivities(f, "private")).forEach(([sig, v]) => (laterActs[sig] = (laterActs[sig] || 0) + v));
      const later = shares(laterActs);
      Object.keys(all).forEach((x) => sigs.add(x));
      return { patient: s.caseReportId, all, truncal, later, n: setN(f, "all") };
    });
    return [...sigs].sort(sortSigs).map((sig) => {
      const present = per.filter((p) => (p.all[sig] || 0) >= 0.05);
      const deltas = per.filter((p) => Object.keys(p.truncal).length && Object.keys(p.later).length).map((p) => (p.later[sig] || 0) - (p.truncal[sig] || 0));
      const top = d3.greatest(per, (p) => p.all[sig] || 0);
      return {
        sig,
        aetiology: aetiology(sig),
        nPresent: present.length,
        patients: present.map((p) => p.patient),
        meanShare: d3.mean(per, (p) => p.all[sig] || 0),
        meanTruncal: d3.mean(per, (p) => p.truncal[sig] || 0),
        meanLater: d3.mean(per, (p) => p.later[sig] || 0),
        meanDelta: deltas.length ? d3.mean(deltas) : NaN,
        top: top ? `${top.patient} (${pct(top.all[sig] || 0)})` : "",
        mutations: d3.sum(per, (p) => (p.all[sig] || 0) * (p.n || 0)),
      };
    });
  }, [summaries, files]);
  const columns = [
    { title: t("components.single-cell.signatures.signature"), dataIndex: "sig", width: 90, render: (s) => <Space size={4}><span style={{ width: 10, height: 10, background: signatureColorOf(s), display: "inline-block", borderRadius: 2 }} /><Text strong>{s}</Text></Space> },
    { title: t("components.single-cell.cohort.sig-aetiology"), dataIndex: "aetiology", ellipsis: true },
    { title: t("components.single-cell.cohort.sig-present"), dataIndex: "nPresent", width: 110, sorter: (a, b) => a.nPresent - b.nPresent, render: (n, r) => <span title={r.patients.join(", ")}>{`${n} / ${summaries.length}`}</span> },
    { title: t("components.single-cell.cohort.sig-mutations"), dataIndex: "mutations", width: 100, sorter: (a, b) => a.mutations - b.mutations, render: (v) => d3.format(",")(Math.round(v)) },
    { title: t("components.single-cell.cohort.sig-mean-share"), dataIndex: "meanShare", width: 100, sorter: (a, b) => a.meanShare - b.meanShare, defaultSortOrder: "descend", render: pct },
    { title: t("components.single-cell.cohort.sig-set-truncal"), dataIndex: "meanTruncal", width: 90, render: pct },
    { title: t("components.single-cell.cohort.sig-later"), dataIndex: "meanLater", width: 90, render: pct },
    { title: t("components.single-cell.cohort.sig-trend"), dataIndex: "meanDelta", width: 120, sorter: (a, b) => (a.meanDelta || 0) - (b.meanDelta || 0), render: (v) => (Number.isFinite(v) ? <Tag color={v > 0.05 ? "volcano" : v < -0.05 ? "geekblue" : "default"}>{`${v > 0.05 ? "↑ later" : v < -0.05 ? "↑ truncal" : "stable"} ${d3.format("+.0%")(v)}`}</Tag> : "–") },
    { title: t("components.single-cell.cohort.sig-top"), dataIndex: "top", width: 150 },
  ];
  return <Table size="small" className="sc-events-table" rowKey="sig" columns={columns} dataSource={rows} pagination={false} />;
}

/**
 * Pan-cohort SBS signatures: evolution bars (truncal / subclonal / private per
 * patient), slope charts per signature, the signature × patient × clonality
 * Fisher matrix, 96-channel spectra with cosine similarity, clone-level fits
 * and a per-signature summary table.
 */
export default function CohortSignaturesPanel({ summaries, files }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(900);
  const theme = useSelector((state) => state.SingleCell.layout.theme);
  setSignatureTheme(theme);
  const [view, setView] = useState("evolution");
  const [mode, setMode] = useState("fraction");
  const [highlight, setHighlight] = useState(null);
  const any = summaries.some((s) => files[s.caseReportId]?.signatures?.sets?.length);
  const legendRows = useMemo(
    () => summaries.map((s) => ({ name: s.caseReportId, activities: (files[s.caseReportId]?.signatures?.sets?.find((x) => x.name === "all")?.activities || []).map((a) => ({ signature: a.signature, activity: Number(a.activity) || 0 })) })),
    [summaries, files]
  );
  if (!any) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.signatures-empty")} />;
  const w = Math.max(500, width - 8);
  const common = { summaries, files, width: w, mode, highlight, setHighlight, t };
  return (
    <Card
      size="small"
      title={<Space><BarChartOutlined />{t("components.single-cell.cohort.signatures-title")}</Space>}
      extra={
        <Space wrap>
          <Segmented size="small" value={view} onChange={setView} options={["evolution", "slope", "matrix", "spectra", "clones", "table"].map((v) => ({ value: v, label: t(`components.single-cell.cohort.sig-view-${v}`) }))} />
          {(view === "evolution" || view === "clones") && (
            <Segmented size="small" value={mode} onChange={setMode} options={[{ value: "fraction", label: t("components.segmented-filter.fraction") }, { value: "count", label: t("components.segmented-filter.count") }]} />
          )}
          <SvgExportButton containerRef={ref} name={`cohort-signatures-${view}`} />
        </Space>
      }
    >
      <div ref={ref}>
        {view === "evolution" && <EvolutionView {...common} />}
        {view === "slope" && <SlopeView {...common} />}
        {view === "matrix" && <CohortSignatureMatrix summaries={summaries} files={files} embedded />}
        {view === "spectra" && <SpectraView {...common} />}
        {view === "clones" && <ClonesView {...common} />}
        {view === "table" && <SummaryTable summaries={summaries} files={files} t={t} />}
        {view !== "table" && view !== "spectra" && <AetiologyLegend rows={legendRows} />}
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>{t(`components.single-cell.cohort.sig-help-${view}`)}</Text>
      </div>
    </Card>
  );
}
