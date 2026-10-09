import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, Descriptions, Empty, Space, Table, Typography } from "antd";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import HintLine from "../hintLine";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { formatP, mannWhitney } from "../../../helpers/singleCell/tests";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { chimericSupport, exonProfile } from "../../../helpers/singleCell/driverContrast";
import useDriverEvidence, { CARRIER_COLOR, COMPARATOR_COLOR } from "./useDriverEvidence";

const { Text } = Typography;

/** DNA breakpoint exon of each fusion partner from the OncoKB-style Variant text ("Exon -1 (...)::Exon 5 (...)"). */
export function breakpointExons(variant) {
  const parts = `${variant || ""}`.split("::");
  return parts.map((p) => {
    const m = p.match(/Exon\s+(-?\d+)/i);
    return m ? Number(m[1]) : null;
  });
}

/** Grouped bars of mean counts per million per exon, 5' to 3' along the transcript. */
function ExonBars({ profile, breakExon, keep }) {
  const [ref, width] = useContainerWidth(400);
  const theme = usePlotTheme();
  const M = { left: 40, right: 6, top: 8, bottom: 24 };
  const H = 130;
  const n = profile.exons.length;
  const plotW = Math.max(width - M.left - M.right, 10);
  const plotH = H - M.top - M.bottom;
  const max = Math.max(1e-9, ...profile.exons.flatMap((e) => [e.a, e.b]).filter(Number.isFinite));
  const band = plotW / n;
  const bw = Math.max(Math.min(band / 2 - 1, 14), 1);
  const y = (v) => M.top + plotH - (v / max) * plotH;
  const bx = breakExon != null && breakExon >= 1 && breakExon <= n ? M.left + (keep === "3p" ? breakExon - 1 : breakExon) * band : null;
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={width} height={H} role="img" aria-label="exon expression">
        <line x1={M.left} x2={M.left + plotW} y1={y(0)} y2={y(0)} stroke={theme.axis} />
        <text x={M.left - 6} y={y(max) + 4} textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>
          {max >= 10 ? Math.round(max) : max.toPrecision(2)}
        </text>
        <text x={M.left - 6} y={y(0) + 4} textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>
          0
        </text>
        {profile.exons.map((e, i) => (
          <g key={e.n}>
            {Number.isFinite(e.a) && <rect x={M.left + i * band + band / 2 - bw} y={y(e.a)} width={bw} height={y(0) - y(e.a)} fill={CARRIER_COLOR} />}
            {Number.isFinite(e.b) && <rect x={M.left + i * band + band / 2} y={y(e.b)} width={bw} height={y(0) - y(e.b)} fill={COMPARATOR_COLOR} />}
            {(n <= 30 || i % Math.ceil(n / 30) === 0) && (
              <text x={M.left + i * band + band / 2} y={H - 8} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>
                {e.n}
              </text>
            )}
            <title>{`exon ${e.n}: carriers ${e.a?.toFixed(2)} / comparator ${e.b?.toFixed(2)} CPM`}</title>
          </g>
        ))}
        {bx != null && <line x1={bx} x2={bx} y1={M.top} y2={y(0)} stroke={theme.text} strokeDasharray="4 3" />}
      </svg>
    </div>
  );
}

/**
 * The driver itself in RNA: expression of its gene(s) in carriers vs comparator
 * and, for fusions, chimeric reads (Arriba calls, including discarded ones) and
 * exon-level expression of each partner around the DNA breakpoint.
 */
export default function DriverEvidenceCard({ driver, carriers, others, rna }) {
  const { t } = useTranslation("common");
  const evidence = useDriverEvidence();
  const { summary, matrix, rowOfId } = rna;
  const isFusion = `${driver.event.fusion_genes || ""}`.includes("::");
  const genes = isFusion ? `${driver.event.fusion_genes}`.split("::") : [`${driver.event.gene || ""}`];
  const entry = evidence.data?.fusions?.find((f) => f.label === driver.event.fusion_genes) || null;
  const libOf = useMemo(() => {
    const m = new Map();
    (summary?.cells || []).forEach((c) => m.set(`${c.displayId}`, Number(c.nCount_RNA)));
    return (id) => m.get(id) || 0;
  }, [summary]);

  const geneRows = useMemo(() => {
    if (!summary || !matrix) return [];
    return genes
      .map((g) => {
        const gi = summary.geneIndex.get(g) ?? summary.geneIndex.get(g.toUpperCase());
        if (gi == null) return null;
        const v = geneValues(matrix, summary.cells.length, gi);
        const va = carriers.map((id) => rowOfId.get(id)).filter((r) => r != null).map((r) => v[r]);
        const vb = others.map((id) => rowOfId.get(id)).filter((r) => r != null).map((r) => v[r]);
        const mean = (x) => (x.length ? x.reduce((s, y) => s + y, 0) / x.length : NaN);
        const det = (x) => (x.length ? x.filter((y) => y > 0).length / x.length : NaN);
        return { gene: g, meanA: mean(va), meanB: mean(vb), detA: det(va), detB: det(vb), p: mannWhitney(va, vb).p };
      })
      .filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, matrix, rowOfId, carriers, others, genes.join("|")]);

  const support = entry ? chimericSupport(entry, carriers, others) : null;
  const breaks = breakpointExons(driver.event.Variant);
  const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "–");

  return (
    <Card size="small" title={t("components.single-cell.drivers.evidence-title")}>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <HintLine text={t(isFusion ? "components.single-cell.drivers.evidence-hint-fusion" : "components.single-cell.drivers.evidence-hint")} />
        {geneRows.length > 0 && (
          <Table
            size="small"
            rowKey="gene"
            pagination={false}
            dataSource={geneRows}
            columns={[
              { title: t("components.single-cell.drivers.gene"), dataIndex: "gene", key: "g", render: (g) => <Text strong>{g}</Text> },
              { title: t("components.single-cell.drivers.carriers"), key: "a", align: "right", render: (_, r) => `${r.meanA.toFixed(2)} · ${pct(r.detA)}` },
              { title: t("components.single-cell.drivers.comparator"), key: "b", align: "right", render: (_, r) => `${r.meanB.toFixed(2)} · ${pct(r.detB)}` },
              { title: "p", dataIndex: "p", key: "p", align: "right", render: (p) => formatP(p) || "–" },
            ]}
          />
        )}
        {isFusion && evidence.status === "missing" && <Text type="secondary">{t("components.single-cell.drivers.no-evidence")}</Text>}
        {isFusion && entry && support && (
          <>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label={<span style={{ color: CARRIER_COLOR }}>{t("components.single-cell.drivers.carriers")}</span>}>
                {t("components.single-cell.drivers.chimeric", support.a)}
              </Descriptions.Item>
              <Descriptions.Item label={<span style={{ color: COMPARATOR_COLOR }}>{t("components.single-cell.drivers.comparator")}</span>}>
                {t("components.single-cell.drivers.chimeric", support.b)}
              </Descriptions.Item>
            </Descriptions>
            {entry.genes.map((g, k) => {
              const profile = exonProfile(entry, g.gene, carriers, others, libOf);
              if (!profile || !profile.nA || !profile.nB) return null;
              return (
                <div key={g.gene}>
                  <Text strong>{g.gene}</Text>{" "}
                  <Text type="secondary" style={{ fontSize: TYPE.tick }}>
                    {t("components.single-cell.drivers.exon-caption", {
                      transcript: g.transcript,
                      n: g.exons.length,
                      side: k === 0 ? "5′" : "3′",
                      exon: breaks[k] ?? "?",
                    })}
                  </Text>
                  <ExonBars profile={profile} breakExon={breaks[k]} keep={k === 0 ? "5p" : "3p"} />
                </div>
              );
            })}
          </>
        )}
        {!geneRows.length && !(isFusion && entry) && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.rna.no-rna")} />}
      </Space>
    </Card>
  );
}
