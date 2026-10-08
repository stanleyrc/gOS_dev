import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Segmented, Space, Typography } from "antd";
import { HeatMapOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { fisherExact } from "../../../helpers/singleCell/tests";
import { setSignatureTheme, signatureColorOf } from "../signaturePanel";

const { Text } = Typography;
const CELL = 30;
const LEFT = 90;
const TOP = 80;
const pct = d3.format(".0%");

/**
 * Signature share per patient and clonality (truncal vs subclonal+private
 * sets of signatures.json), with Fisher's exact test per patient comparing
 * the signature's mutation count in truncal vs later sites (* p < 0.01).
 */
export default function CohortSignatureMatrix({
  summaries,
  files,
  embedded = false,
}) {
  const { t } = useTranslation("common");
  const theme = useSelector((s) => s.SingleCell.layout.theme);
  setSignatureTheme(theme);
  const [ref, width] = useContainerWidth(900);
  const [mode, setMode] = useState("share");
  const data = useMemo(() => {
    const sigs = new Set();
    const per = summaries
      .map((s) => {
        const sets = files[s.caseReportId]?.signatures?.sets || [];
        const get = (name) =>
          Object.fromEntries(
            (sets.find((x) => x.name === name)?.activities || []).map((a) => [
              a.signature,
              Number(a.activity) || 0,
            ]),
          );
        const truncal = get("truncal");
        const later = { ...get("subclonal") };
        Object.entries(get("private")).forEach(
          ([k, v]) => (later[k] = (later[k] || 0) + v),
        );
        if (!Object.keys(truncal).length && !Object.keys(later).length)
          return null;
        Object.keys(truncal).forEach((k) => sigs.add(k));
        Object.keys(later).forEach((k) => sigs.add(k));
        return {
          patient: s.caseReportId,
          truncal,
          later,
          nT: d3.sum(Object.values(truncal)),
          nL: d3.sum(Object.values(later)),
        };
      })
      .filter(Boolean);
    const signatures = [...sigs].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    const cells = [];
    per.forEach((p) => {
      signatures.forEach((sig) => {
        const a = Math.round(p.truncal[sig] || 0);
        const c = Math.round(p.later[sig] || 0);
        const { p: pv, oddsRatio } = fisherExact(
          a,
          Math.round(p.nT) - a,
          c,
          Math.round(p.nL) - c,
        );
        cells.push({
          patient: p.patient,
          sig,
          truncalShare: p.nT ? a / p.nT : 0,
          laterShare: p.nL ? c / p.nL : 0,
          a,
          c,
          p: pv,
          oddsRatio,
        });
      });
    });
    return { per, signatures, cells };
  }, [summaries, files]);
  if (!data.per.length) return null;
  const cols = data.per.flatMap((p) => [
    { patient: p.patient, kind: "truncal" },
    { patient: p.patient, kind: "later" },
  ]);
  const colW = Math.max(48, Math.min(72, (width - LEFT - 20) / cols.length));
  const w = LEFT + cols.length * colW + 20;
  const h = TOP + data.signatures.length * CELL + 8;
  const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1]);
  const inner = (
    <div ref={ref} style={{ overflowX: "auto" }}>
      {embedded && (
        <div style={{ marginBottom: 8 }}>
          <Segmented
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "share",
                label: t("components.segmented-filter.fraction"),
              },
              { value: "count", label: t("components.segmented-filter.count") },
            ]}
          />
        </div>
      )}
      <svg width={w} height={h} style={{ display: "block" }}>
        {data.per.map((p, i) => (
          <text
            key={p.patient}
            x={LEFT + (2 * i + 1) * colW}
            y={TOP - 46}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill="#262626"
          >
            {p.patient}
          </text>
        ))}
        {cols.map((c, j) => (
          <text
            key={`${c.patient}-${c.kind}`}
            x={LEFT + (j + 0.5) * colW}
            y={TOP - 28}
            textAnchor="middle"
            fontSize={10}
            fill="#595959"
          >
            {c.kind === "truncal"
              ? t("components.single-cell.cohort.sigmat-truncal")
              : t("components.single-cell.cohort.sigmat-later")}
          </text>
        ))}
        {cols.map((c, j) => {
          const p = data.per.find((x) => x.patient === c.patient);
          return (
            <text
              key={`n-${j}`}
              x={LEFT + (j + 0.5) * colW}
              y={TOP - 12}
              textAnchor="middle"
              fontSize={9}
              fill="#8c8c8c"
            >{`n=${Math.round(c.kind === "truncal" ? p.nT : p.nL)}`}</text>
          );
        })}
        {data.signatures.map((sig, i) => (
          <g key={sig}>
            <rect
              x={0}
              y={TOP + i * CELL + 6}
              width={6}
              height={CELL - 12}
              fill={signatureColorOf(sig)}
            />
            <text
              x={LEFT - 8}
              y={TOP + i * CELL + CELL / 2}
              dy="0.35em"
              textAnchor="end"
              fontSize={12}
              fill="#262626"
            >
              {sig}
            </text>
            {cols.map((c, j) => {
              const cell = data.cells.find(
                (x) => x.patient === c.patient && x.sig === sig,
              );
              const share =
                c.kind === "truncal" ? cell.truncalShare : cell.laterShare;
              const count = c.kind === "truncal" ? cell.a : cell.c;
              return (
                <g key={`${c.patient}-${c.kind}`}>
                  <rect
                    x={LEFT + j * colW + 1}
                    y={TOP + i * CELL + 1}
                    width={colW - 2}
                    height={CELL - 2}
                    fill={color(share)}
                    rx={3}
                  />
                  <text
                    x={LEFT + (j + 0.5) * colW}
                    y={TOP + i * CELL + CELL / 2}
                    dy="0.35em"
                    textAnchor="middle"
                    fontSize={10}
                    fill={share > 0.5 ? "#fff" : "#262626"}
                  >
                    {mode === "share" ? pct(share) : count}
                    {c.kind === "later" && cell.p < 0.01 ? "*" : ""}
                  </text>
                  <title>{`${c.patient} · ${sig} · ${c.kind}: ${count} mutations (${pct(share)})\nFisher truncal vs later: p ${cell.p < 1e-4 ? "< 1e-4" : cell.p.toFixed(3)}, OR ${Number.isFinite(cell.oddsRatio) ? cell.oddsRatio.toFixed(2) : "∞"}`}</title>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {t("components.single-cell.cohort.sigmat-help")}
      </Text>
    </div>
  );
  if (embedded) return inner;
  return (
    <Card
      size="small"
      title={
        <Space>
          <HeatMapOutlined />
          {t("components.single-cell.cohort.sigmat-title")}
        </Space>
      }
      extra={
        <Space>
          <Segmented
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "share",
                label: t("components.segmented-filter.fraction"),
              },
              { value: "count", label: t("components.segmented-filter.count") },
            ]}
          />
          <SvgExportButton containerRef={ref} name="cohort-signature-matrix" />
        </Space>
      }
    >
      {inner}
    </Card>
  );
}
