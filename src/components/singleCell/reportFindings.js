import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Col, Row, Space, Tag, Typography } from "antd";
import { BulbOutlined } from "@ant-design/icons";
import useRnaData from "./rna/useRnaData";
import useTreeView from "./useTreeView";
import { loadCosmic, signatureColorOf } from "./signaturePanel";
import { dosagePoints, geneLocus } from "../../helpers/singleCell/dosage";
import { correlationP } from "../../helpers/singleCell/tests";
import { cosine, nnls, sbs96Counts } from "../../helpers/singleCell/signatures";
import { rowMap } from "../../helpers/singleCell/matrix";
import { sitesSeenInRows } from "../../helpers/singleCell/snvSites";
import { chiSquareUpper } from "../../helpers/singleCell/tests";
import { snvCopyNumber } from "../../helpers/singleCell/snvCopyNumber";
import HintLine from "./hintLine";
import { SC_GUTTER_INNER } from "./density";

const { Text, Title } = Typography;
const pct = d3.format(".0%");

/** Chi-square test of independence on a contingency table (rows x cols). */
function chiSquare(table) {
  const rows = table.length;
  const cols = table[0]?.length || 0;
  const rowSum = table.map((r) => d3.sum(r));
  const colSum = d3.range(cols).map((j) => d3.sum(table, (r) => r[j]));
  const n = d3.sum(rowSum);
  if (!n || rows < 2 || cols < 2) return NaN;
  let x2 = 0;
  table.forEach((r, i) => r.forEach((v, j) => {
    const e = (rowSum[i] * colSum[j]) / n;
    if (e > 0) x2 += ((v - e) ** 2) / e;
  }));
  return chiSquareUpper(x2, (rows - 1) * (cols - 1));
}

/**
 * Extra findings for the open patient, computed in the browser: cell-state
 * composition per clone (RNA), expression of amplified / deleted drivers
 * versus their copy number (CN x RNA), and SBS signature shifts per clone.
 */
export default function ReportFindings({ report, cloneColors }) {
  const { t } = useTranslation("common");
  const { cells, cn, snv, signatures } = useSelector((s) => s.SingleCell);
  const genesState = useSelector((s) => s.Genes);
  const { summary, matrix, rowOfId } = useRnaData();
  const { order, cellById } = useTreeView();
  const [cladeSigs, setCladeSigs] = useState(null);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const tumorClones = report.clones.map((c) => c.clone);

  /* ---- RNA: state composition per clone ---- */
  const states = useMemo(() => {
    if (!summary) return null;
    const field = ["state", "Cell_State", "cell_state"].find((f) => summary.fields.some((x) => x.name === f));
    if (!field) return null;
    const levels = [...new Set(summary.cells.map((c) => c[field]).filter((v) => v != null && v !== ""))].sort();
    const byClone = {};
    summary.cells.forEach((c) => {
      const clone = c.cell_id ? cloneOf.get(c.cell_id) : null;
      if (clone == null || /^normal$/i.test(`${clone}`) || c[field] == null || c[field] === "") return;
      byClone[clone] = byClone[clone] || Object.fromEntries(levels.map((l) => [l, 0]));
      byClone[clone][c[field]] += 1;
    });
    const clones = Object.keys(byClone).filter((c) => d3.sum(Object.values(byClone[c])) >= 5);
    const table = clones.map((c) => levels.map((l) => byClone[c][l]));
    const phase = summary.fields.some((x) => x.name === "Phase")
      ? Object.fromEntries(clones.map((c) => {
          const cc = summary.cells.filter((x) => x.cell_id && cloneOf.get(x.cell_id) === c && x.Phase);
          return [c, cc.length ? cc.filter((x) => x.Phase !== "G1").length / cc.length : NaN];
        }))
      : null;
    return { field, levels, byClone, clones, p: clones.length >= 2 ? chiSquare(table) : NaN, phase };
  }, [summary, cloneOf]);

  /* ---- CN x RNA: dosage of copy-number drivers ---- */
  const dosage = useMemo(() => {
    if (!summary || !matrix || cn.status !== "ok") return [];
    const drivers = [...report.clonal, ...report.subclonal].filter((d) => d.class === "amp" || d.class === "homdel");
    return drivers
      .map((d) => {
        const gene = `${d.gene}`.split("::")[0];
        const locus = geneLocus(genesState, gene);
        const gi = summary.geneIndex.get(gene);
        if (!locus || gi == null) return null;
        const r = dosagePoints({ cn: cn.data, summary, matrix, rowOfId, locus, geneIndex: gi });
        if (!r || r.points.length < 8) return null;
        const carriers = new Set(`${d.event.cell_ids || ""}`.split(",").filter(Boolean));
        const inside = r.points.filter((p) => carriers.has(p.id)).map((p) => p.expr);
        const outside = r.points.filter((p) => !carriers.has(p.id)).map((p) => p.expr);
        return { ...d, gene, rho: r.rho, p: correlationP(r.rho, r.points.length), n: r.points.length, meanIn: d3.mean(inside), meanOut: d3.mean(outside), nIn: inside.length, nOut: outside.length };
      })
      .filter(Boolean)
      .sort((a, b) => (b.rho || 0) - (a.rho || 0));
  }, [summary, matrix, cn, report, genesState, rowOfId]);

  /* ---- signatures per clone vs truncal ---- */
  useEffect(() => {
    if (snv.status !== "ok" || !snv.data?.variants?.some((v) => v.context) || !order.length) return undefined;
    let active = true;
    (async () => {
      const reference = await loadCosmic();
      const known = new Set((signatures.status === "ok" ? signatures.data?.sets || [] : []).flatMap((s) => (s.activities || []).map((a) => a.signature)));
      const subset = reference.names.map((n, j) => [n, j]).filter(([n]) => known.has(n));
      if (subset.length < 2) return;
      const cols = subset.map(([, j]) => reference.columns[j]);
      const rows = rowMap(order, snv.data.cells);
      const truncal = sbs96Counts(snv.data.variants.filter((v) => v.category === "truncal").map((v) => v.context).filter(Boolean)).counts;
      const fit = (counts) => {
        const x = nnls(cols, counts);
        const total = x.reduce((a, b) => a + b, 0) || 1;
        return subset.map(([n], k) => ({ signature: n, share: x[k] / total })).sort((a, b) => b.share - a.share);
      };
      const truncalFit = fit(truncal);
      const out = tumorClones.map((clone) => {
        const cellRows = order.map((id, r) => (cellById.get(id)?.clone_id === clone ? rows[r] : -1)).filter((r) => r >= 0);
        const seen = sitesSeenInRows(snv.data, cellRows);
        // subclonal / private sites only: what the clone acquired after the trunk
        const contexts = [...seen].filter((c) => snv.data.variants[c].category !== "truncal").map((c) => snv.data.variants[c].context).filter(Boolean);
        const { counts, used } = sbs96Counts(contexts);
        if (used < 20) return { clone, n: used, top: null };
        const f = fit(counts);
        return { clone, n: used, top: f[0], second: f[1], cos: cosine(counts, truncal), gained: f.filter((s) => s.share >= 0.1 && (truncalFit.find((x) => x.signature === s.signature)?.share || 0) < 0.03) };
      });
      if (active) setCladeSigs({ truncal: truncalFit.slice(0, 3), clones: out });
    })().catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snv, signatures, order.length, tumorClones.join("|")]);

  /* ---- SNVs on amplicons (mutant copies >= 1.5 on CN >= 4: mutated before the amplification) ---- */
  const amplifiedSnvs = useMemo(() => {
    if (snv.status !== "ok" || cn.status !== "ok") return [];
    const info = snvCopyNumber(snv.data, cn.data);
    return snv.data.variants
      .map((v, c) => ({ v, i: info[c] }))
      .filter((x) => x.i?.amplified)
      .sort((a, b) => Number(b.v.driver) - Number(a.v.driver) || b.i.altCopies - a.i.altCopies);
  }, [snv, cn]);

  const hasAny = states || dosage.length || cladeSigs || amplifiedSnvs.length;
  if (!hasAny) return null;

  return (
    <Card size="small" title={<Space><BulbOutlined />{t("components.single-cell.report.findings-title")}</Space>}>
      <Row gutter={SC_GUTTER_INNER}>
        {cladeSigs && (
          <Col xs={24} xl={8}>
            <Title level={5} className="sc-section-title">{t("components.single-cell.report.findings-sigs")}</Title>
            <Text type="secondary">{t("components.single-cell.report.findings-sigs-trunk", { list: cladeSigs.truncal.map((s) => `${s.signature} ${pct(s.share)}`).join(", ") })}</Text>
            {cladeSigs.clones.map((c) => (
              <div key={c.clone} style={{ marginTop: 6 }}>
                <Tag color={cloneColors[c.clone]}>{c.clone}</Tag>
                {c.top ? (
                  <Text>
                    {t("components.single-cell.report.findings-sigs-clone", { n: c.n, top: c.top.signature, share: pct(c.top.share), cos: pct(c.cos) })}
                    {c.gained.length > 0 && <Text type="danger">{` ${t("components.single-cell.report.findings-sigs-gained", { list: c.gained.map((s) => `${s.signature} ${pct(s.share)}`).join(", ") })}`}</Text>}
                  </Text>
                ) : (
                  <Text type="secondary">{t("components.single-cell.report.findings-sigs-few", { n: c.n })}</Text>
                )}
              </div>
            ))}
          </Col>
        )}
        {states && (
          <Col xs={24} xl={8}>
            <Title level={5} className="sc-section-title">{t("components.single-cell.report.findings-rna")}</Title>
            <Text type="secondary">
              {t("components.single-cell.report.findings-rna-test", { field: states.field, p: Number.isFinite(states.p) ? (states.p < 1e-4 ? "p < 1e-4" : `p = ${states.p.toFixed(3)}`) : "n/a" })}
            </Text>
            {states.clones.map((c) => {
              const total = d3.sum(Object.values(states.byClone[c])) || 1;
              const top = Object.entries(states.byClone[c]).sort((a, b) => b[1] - a[1]);
              return (
                <div key={c} style={{ marginTop: 6 }}>
                  <Tag color={cloneColors[c]}>{c}</Tag>
                  <Text>{top.slice(0, 3).map(([l, n]) => `${l} ${pct(n / total)}`).join(", ")}</Text>
                  {states.phase && Number.isFinite(states.phase[c]) && <Text type="secondary">{` · ${t("components.single-cell.report.findings-cycling", { pct: pct(states.phase[c]) })}`}</Text>}
                  <svg width={220} height={8} style={{ display: "block", marginTop: 2 }}>
                    {(() => {
                      let x = 0;
                      const palette = d3.scaleOrdinal(d3.schemeTableau10).domain(states.levels);
                      return top.map(([l, n]) => {
                        const w = (220 * n) / total;
                        const r = <rect key={l} x={x} y={0} width={Math.max(0, w - 0.5)} height={8} fill={{ MES: "#eb2626", NPC: "#3b54a3", OPC: "#6cbd45", AC: "#f9a41b" }[l] || palette(l)}><title>{`${l}: ${n}`}</title></rect>;
                        x += w;
                        return r;
                      });
                    })()}
                  </svg>
                </div>
              );
            })}
          </Col>
        )}
        {amplifiedSnvs.length > 0 && (
          <Col xs={24} xl={8}>
            <Title level={5} className="sc-section-title">{t("components.single-cell.report.findings-amplified")}</Title>
            <Text type="secondary">{t("components.single-cell.report.findings-amplified-help", { count: amplifiedSnvs.length })}</Text>
            {amplifiedSnvs.slice(0, 12).map(({ v, i }) => (
              <div key={v.id} style={{ marginTop: 4 }}>
                <Text strong>{v.gene || v.id}</Text>{" "}
                <Text>{t("components.single-cell.report.findings-amplified-row", { variant: v.protein || v.consequence || v.id, cn: i.medianCn.toFixed(1), copies: Number.isFinite(i.altCopies) ? i.altCopies.toFixed(1) : "–", n: i.nCarriers })}</Text>
                {v.driver && <Tag color="red" style={{ marginLeft: 6 }}>driver</Tag>}
                {v.category && <Tag style={{ marginLeft: 4 }}>{t(`components.single-cell.snv.category-${v.category}`)}</Tag>}
              </div>
            ))}
          </Col>
        )}
        {dosage.length > 0 && (
          <Col xs={24} xl={8}>
            <Title level={5} className="sc-section-title">{t("components.single-cell.report.findings-dosage")}</Title>
            {dosage.map((d) => (
              <div key={d.label} style={{ marginTop: 6 }}>
                <Text strong>{d.gene}</Text>{" "}
                <Text>{t("components.single-cell.report.findings-dosage-row", { kind: d.class === "amp" ? "amplification" : "deletion", rho: Number.isFinite(d.rho) ? d.rho.toFixed(2) : "–", inside: Number.isFinite(d.meanIn) ? d.meanIn.toFixed(2) : "–", outside: Number.isFinite(d.meanOut) ? d.meanOut.toFixed(2) : "–", nIn: d.nIn, nOut: d.nOut })}</Text>
                {Number.isFinite(d.p) && d.p < 0.01 && Math.abs(d.rho) >= 0.3 && <Tag color={d.rho > 0 ? "red" : "blue"} style={{ marginLeft: 6 }}>{d.rho > 0 ? t("components.single-cell.report.findings-expressed") : t("components.single-cell.report.findings-anticorrelated")}</Tag>}
              </div>
            ))}
            <HintLine text={t("components.single-cell.report.findings-dosage-help")} />
          </Col>
        )}
      </Row>
      <div style={{ marginTop: 8 }}>
        {cladeSigs && [...new Set([...cladeSigs.truncal, ...cladeSigs.clones.flatMap((c) => (c.top ? [c.top] : []))].map((s) => s.signature))].map((s) => (
          <Tag key={s} style={{ borderColor: signatureColorOf(s), color: signatureColorOf(s) }}>{s}</Tag>
        ))}
      </div>
    </Card>
  );
}
