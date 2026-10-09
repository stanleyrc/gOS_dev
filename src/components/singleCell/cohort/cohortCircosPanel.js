import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Select, Space, Switch, Typography } from "antd";
import { RadarChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { eventClass } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";
import { Swatches, patientColor } from "./charts";
import HintLine, { Provenance } from "../hintLine";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };
const CHR_COLORS = d3.scaleOrdinal([...d3.schemeTableau10, ...d3.schemeSet3]);

const parseLoc = (s) => {
  const m = `${s || ""}`.match(/^(\w+):(\d+)-(\d+)/);
  return m ? { chr: m[1].replace(/^chr/, ""), start: Number(m[2]), end: Number(m[3]) } : null;
};

/**
 * Cohort circos of the filtered events: one ring per patient; each tier
 * 1–2 alteration of the chosen genes is a mark at its locus (class colour,
 * opacity = fraction of tumor cells); fusions are arcs between the partner
 * loci. Default genes: those altered in most patients.
 */
export default function CohortCircosPanel({ summaries, files }) {
  const { t } = useTranslation("common");
  const { chromoBins, genomeLength } = useSelector((s) => s.Settings);
  const [ref, width] = useContainerWidth(900);
  const [strongOnly, setStrongOnly] = useState(true);
  const [picked, setPicked] = useState(null);
  const chromosomes = Object.keys(chromoBins || {});
  const toPlace = (chr, pos) => (chromoBins[chr] ? chromoBins[chr].startPlace + pos - chromoBins[chr].startPoint : null);

  const events = useMemo(
    () =>
      summaries.flatMap((s, k) =>
        (files[s.caseReportId]?.events || [])
          .filter((e) => Number(e.Tier ?? 9) <= 2 && (!strongOnly || isStrongEvent(e)))
          .map((e) => ({ patient: s.caseReportId, k, gene: e.gene || e.fusion_genes, cls: eventClass(e), fraction: Number(e.cell_fraction) || 0, cells: e.cells, loc: parseLoc(e.Genome_Location), fusion: `${e.fusion_gene_coords || ""}`.split(",").map(parseLoc).filter(Boolean), label: e.Variant || e.type }))
      ),
    [summaries, files, strongOnly]
  );
  const ranked = useMemo(() => {
    const byGene = new Map();
    events.forEach((e) => {
      if (!e.gene) return;
      if (!byGene.has(e.gene)) byGene.set(e.gene, new Set());
      byGene.get(e.gene).add(e.patient);
    });
    return [...byGene.entries()].map(([gene, ps]) => ({ gene, patients: ps.size })).sort((a, b) => b.patients - a.patients || a.gene.localeCompare(b.gene));
  }, [events]);
  const genes = picked ?? ranked.slice(0, 12).map((r) => r.gene);
  const shown = events.filter((e) => genes.includes(e.gene));
  if (!chromosomes.length || !ranked.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.oncoprint-empty")} />;

  const size = Math.min(Math.max(480, width - 24), 820);
  const R = size / 2;
  const total = genomeLength || 1;
  const gap = 0.012;
  const angle = (place) => {
    const k = chromosomes.findIndex((c) => place >= chromoBins[c].startPlace && place <= chromoBins[c].endPlace);
    return -Math.PI / 2 + (place / total) * (2 * Math.PI - gap * chromosomes.length) + gap * (Math.max(0, k) + 0.5);
  };
  const arc = (a0, a1, r0, r1) => d3.arc()({ innerRadius: r0, outerRadius: r1, startAngle: a0 + Math.PI / 2, endAngle: a1 + Math.PI / 2 });
  const ideo = [R - 30, R - 16];
  const ringW = Math.min(26, Math.max(12, (R - 120) / Math.max(1, summaries.length)));
  const ringR = (k) => [ideo[0] - 6 - (k + 1) * ringW, ideo[0] - 6 - k * ringW - 2];
  const innerR = ideo[0] - 8 - summaries.length * ringW;
  const labelled = new Set();

  return (
    <Card
      size="small"
      title={<Space><RadarChartOutlined />{t("components.single-cell.cohort.circos-title")}<Provenance id="oncoprint" /></Space>}
      extra={
        <Space wrap>
          <Select size="small" mode="multiple" showSearch maxTagCount="responsive" style={{ minWidth: 300, maxWidth: 520 }} value={genes} onChange={setPicked} options={ranked.map((r) => ({ value: r.gene, label: `${r.gene} (${r.patients})` }))} filterOption={(i, o) => o.label.toUpperCase().includes(i.toUpperCase())} />
          <Switch size="small" checked={strongOnly} onChange={setStrongOnly} />
          <Text>{t("components.single-cell.events.strong-only")}</Text>
          <SvgExportButton containerRef={ref} name="cohort-circos" />
        </Space>
      }
    >
      <div ref={ref} style={{ display: "flex", justifyContent: "center" }}>
        <svg width={size} height={size}>
          <g transform={`translate(${R},${R})`}>
            {chromosomes.map((chr, i) => {
              const c = chromoBins[chr];
              const a0 = angle(c.startPlace);
              const a1 = angle(c.endPlace);
              const mid = (a0 + a1) / 2;
              return (
                <g key={chr}>
                  <path d={arc(a0, a1, ideo[0], ideo[1])} fill={CHR_COLORS(i)} fillOpacity={0.85} stroke={INK.panel} strokeWidth={0.8} />
                  <text x={Math.cos(mid) * (R - 5)} y={Math.sin(mid) * (R - 5)} dy="0.35em" textAnchor="middle" fontSize={11} fontWeight={600} fill={INK.text} transform={`rotate(${(mid * 180) / Math.PI + 90} ${Math.cos(mid) * (R - 5)} ${Math.sin(mid) * (R - 5)})`}>{chr}</text>
                </g>
              );
            })}
            {summaries.map((s, k) => {
              const [r0, r1] = ringR(k);
              return (
                <g key={s.caseReportId}>
                  <circle r={(r0 + r1) / 2} fill="none" stroke={patientColor(k)} strokeWidth={r1 - r0} strokeOpacity={0.1} />
                  <text x={0} y={-(r0 + r1) / 2} dy="0.35em" textAnchor="middle" fontSize={TYPE.micro} fill={patientColor(k)}>{s.caseReportId}</text>
                </g>
              );
            })}
            {shown.map((e, i) => {
              const [r0, r1] = ringR(e.k);
              const marks = [];
              if (e.loc && e.cls !== "fusion") {
                const p0 = toPlace(e.loc.chr, e.loc.start);
                const p1 = toPlace(e.loc.chr, e.loc.end);
                if (p0 != null && p1 != null) {
                  const a0 = angle(p0) - 0.004;
                  const a1 = angle(p1) + 0.004;
                  marks.push(<path key={`m${i}`} d={arc(a0, a1, r0, r1)} fill={CLASS_COLORS[e.cls]} fillOpacity={0.35 + 0.65 * e.fraction}><title>{`${e.patient} · ${e.gene} ${e.label || ""} · ${e.cells || ""}`}</title></path>);
                  const key = `${e.gene}`;
                  if (!labelled.has(key)) {
                    labelled.add(key);
                    const mid = (a0 + a1) / 2;
                    marks.push(<text key={`t${i}`} x={Math.cos(mid) * (innerR - 14)} y={Math.sin(mid) * (innerR - 14)} dy="0.35em" textAnchor={Math.cos(mid) >= 0 ? "start" : "end"} fontSize={11} fill={INK.text} transform={`rotate(${(mid * 180) / Math.PI + (Math.cos(mid) >= 0 ? 0 : 180)} ${Math.cos(mid) * (innerR - 14)} ${Math.sin(mid) * (innerR - 14)})`}>{e.gene}</text>);
                  }
                }
              }
              if (e.cls === "fusion" && e.fusion.length >= 2) {
                const pa = toPlace(e.fusion[0].chr, e.fusion[0].start);
                const pb = toPlace(e.fusion[1].chr, e.fusion[1].start);
                if (pa != null && pb != null) {
                  const r = innerR - 4;
                  const [x0, y0] = [Math.cos(angle(pa)) * r, Math.sin(angle(pa)) * r];
                  const [x1, y1] = [Math.cos(angle(pb)) * r, Math.sin(angle(pb)) * r];
                  const dist = Math.hypot(x1 - x0, y1 - y0);
                  const pull = Math.min(0.92, dist / (2 * r));
                  marks.push(<path key={`f${i}`} d={`M${x0},${y0} Q${((x0 + x1) / 2) * (1 - pull)},${((y0 + y1) / 2) * (1 - pull)} ${x1},${y1}`} fill="none" stroke={patientColor(e.k)} strokeWidth={1 + 2.5 * e.fraction} strokeOpacity={0.75}><title>{`${e.patient} · ${e.gene} · ${e.cells || ""}`}</title></path>);
                  marks.push(<path key={`fa${i}`} d={arc(angle(pa) - 0.004, angle(pa) + 0.004, r0, r1)} fill={CLASS_COLORS.fusion} fillOpacity={0.35 + 0.65 * e.fraction} />);
                  marks.push(<path key={`fb${i}`} d={arc(angle(pb) - 0.004, angle(pb) + 0.004, r0, r1)} fill={CLASS_COLORS.fusion} fillOpacity={0.35 + 0.65 * e.fraction} />);
                }
              }
              return marks;
            })}
          </g>
        </svg>
      </div>
      <Swatches style={{ marginTop: 6 }} items={[...Object.entries(CLASS_COLORS).filter(([k]) => k !== "other").map(([k, c]) => ({ key: k, color: c, label: t(`components.single-cell.cohort.class-${k}`) })), ...summaries.map((s, k) => ({ key: s.caseReportId, color: patientColor(k), label: `${t("components.single-cell.circos.ring", { n: k + 1 })} ${s.caseReportId}` }))]} />
      <HintLine text={t("components.single-cell.cohort.circos-help")} />
    </Card>
  );
}
