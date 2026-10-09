import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Segmented, Space, Spin, Typography } from "antd";
import Violins from "../violins";
import HintLine from "../hintLine";
import { patientColor } from "../../../helpers/singleCell/patientColors";
import { casePath, loadRnaMatrix, loadRnaSummary, tryGet } from "../../../redux/singleCell/loaders";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { cellEventPsi, eventPsi } from "../../../helpers/singleCell/spliceEvents";
import { compareGroups, formatP } from "../../../helpers/singleCell/tests";

const { Text } = Typography;
const exonCache = new Map();
const patientSplicingCache = new Map();

/** data/_cohort/rna/splice_exons.json (exon models of the spliced genes), fetched once; null while loading / missing. */
export function useSpliceExons(dataset) {
  const [model, setModel] = useState(null);
  useEffect(() => {
    if (!dataset?.dataPath) return undefined;
    const key = dataset.dataPath;
    if (!exonCache.has(key)) exonCache.set(key, tryGet(`${dataset.dataPath}_cohort/rna/splice_exons.json`).catch(() => ({ status: "missing" })));
    let active = true;
    exonCache.get(key).then((r) => active && setModel(r?.status === "ok" ? r.data : null));
    return () => {
      active = false;
    };
  }, [dataset]);
  return model;
}

function loadPatientSplicing(dataset, patient) {
  const key = `${dataset.dataPath}${patient}`;
  if (!patientSplicingCache.has(key)) patientSplicingCache.set(key, tryGet(casePath(dataset, patient, "rna/splicing.json")).catch(() => ({ status: "missing" })));
  return patientSplicingCache.get(key);
}

const fmtPos = (v) => Number(v).toLocaleString("en-US");

/** Human description of an event: "PTBP2 exon 10 (chr1:96,806,419-96,806,452, 34 bp) inclusion". */
export function eventTitle(cluster, event) {
  if (!event) return cluster?.gene || "";
  if (event.type === "cassette") {
    const ex = event.exon;
    return `${cluster.gene} ${event.exonNumber != null ? `exon ${event.exonNumber}` : "cassette exon"} (chr${`${cluster.chromosome}`.replace(/^chr/, "")}:${fmtPos(ex.start)}-${fmtPos(ex.end)}, ${ex.end - ex.start + 1} bp) inclusion`;
  }
  return `${cluster.gene} ${event.label}`;
}

/**
 * One splicing event across patients: per-cell PSI of the event (cells with
 * >= 3 reads on its junctions) and the gene's expression, as violins per
 * patient, optionally split by a cell field (state / phase); the pooled PSI
 * per patient is in the sashimi plot above.
 */
export default function CohortSpliceEvent({ dataset, patients, cluster, event }) {
  const { t } = useTranslation("common");
  const [split, setSplit] = useState("none");
  const [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    setData(null);
    (async () => {
      const out = [];
      for (const p of patients) {
        let spl = null;
        let summary = null;
        try {
          // eslint-disable-next-line no-await-in-loop
          [spl, summary] = await Promise.all([loadPatientSplicing(dataset, p), Promise.resolve(loadRnaSummary(dataset, p)).catch(() => null)]);
        } catch (e) {
          spl = null;
        }
        if (!active) return;
        const cl = spl?.status === "ok" ? (spl.data.clusters || []).find((c) => c.id === cluster.id) : null;
        const cellOf = new Map((summary?.cells || []).map((c, k) => [`${c.rna_id}`, { ...c, row: k }]));
        let expr = null;
        const gi = summary ? summary.geneIndex.get(cluster.gene) ?? summary.geneIndex.get(`${cluster.gene}`.toUpperCase()) : null;
        if (gi != null) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const m = await loadRnaMatrix(dataset, p);
            const v = geneValues(m, summary.cells.length, gi);
            expr = summary.cells.map((c, k) => ({ cell: c, value: v[k] }));
          } catch (e) {
            expr = null;
          }
        }
        out.push({ patient: p, psi: cl && event ? cellEventPsi(cl, event).map((c) => ({ ...c, cell: cellOf.get(c.id) || null })) : [], expr, fields: summary?.fields || [] });
      }
      if (active) setData(out);
    })();
    return () => {
      active = false;
    };
  }, [dataset, patients, cluster, event]);

  const splitFields = useMemo(() => {
    const names = new Set();
    (data || []).forEach((d) => d.fields.filter((f) => !f.numeric && (f.levels || []).length > 1 && (f.levels || []).length <= 8).forEach((f) => names.add(f.name)));
    return ["state", "Phase"].filter((f) => names.has(f));
  }, [data]);

  if (!data) return <Spin size="small" />;
  const levelColors = ["#4E79A7", "#F28E2B", "#59A14F", "#E15759", "#76B7B2", "#B07AA1", "#EDC948", "#FF9DA7"];
  const allLevels = split === "none" ? [] : [...new Set(data.flatMap((d) => [...d.psi, ...(d.expr || [])].map((x) => x.cell?.[split]).filter((v) => v != null && v !== "")))].map(String).sort();
  const groupsOf = (rowsOf) =>
    data.flatMap((d, i) => {
      const rows = rowsOf(d) || [];
      if (split === "none") return [{ key: d.patient, label: d.patient, color: patientColor(i), values: rows.map((r) => r.v) }];
      return allLevels
        .map((l, li) => ({ key: `${d.patient}:${l}`, label: l, cluster: d.patient, color: levelColors[li % levelColors.length], values: rows.filter((r) => `${r.cell?.[split]}` === l).map((r) => r.v) }))
        .filter((g) => g.values.length > 0);
    });
  const psiGroups = groupsOf((d) => d.psi.map((c) => ({ v: c.psi, cell: c.cell })));
  const exprGroups = groupsOf((d) => (d.expr || []).filter((r) => !r.cell.Cell_Type || /malignant|tumou?r/i.test(`${r.cell.Cell_Type}`)).map((r) => ({ v: r.value, cell: r.cell })));
  const test = (groups) => {
    const g = groups.filter((x) => x.values.length >= 3);
    return g.length >= 2 ? compareGroups(g.map((x) => ({ key: x.key, values: x.values }))) : null;
  };
  const psiTest = split === "none" ? test(psiGroups) : null;
  const exprTest = split === "none" ? test(exprGroups) : null;

  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <Space wrap>
        <Text strong>{eventTitle(cluster, event)}</Text>
        {splitFields.length > 0 && (
          <Segmented size="small" value={split} onChange={setSplit} options={[{ value: "none", label: t("components.single-cell.splicing.split-none") }, ...splitFields.map((f) => ({ value: f, label: t("components.single-cell.splicing.split-by", { field: f }) }))]} />
        )}
      </Space>
      <HintLine text={t("components.single-cell.splicing.event-help")} />
      {event ? (
        <>
          <Text type="secondary">
            {t("components.single-cell.splicing.cell-psi")} {psiTest ? formatP(psiTest.p) : ""}
          </Text>
          <Violins groups={psiGroups} domain={[0, 1]} yTitle="PSI" height={220} />
        </>
      ) : (
        <Text type="secondary">{t("components.single-cell.splicing.no-event")}</Text>
      )}
      <Text type="secondary">
        {t("components.single-cell.splicing.gene-expr", { gene: cluster.gene })} {exprTest ? formatP(exprTest.p) : ""}
      </Text>
      <Violins groups={exprGroups} yTitle={`${cluster.gene} (log-norm.)`} height={220} showDetected />
      {split !== "none" && (
        <Space size={[10, 0]} wrap>
          {allLevels.map((l, li) => (
            <Text key={l} style={{ fontSize: 12 }}>
              <span style={{ color: levelColors[li % levelColors.length] }}>■</span> {l}
            </Text>
          ))}
        </Space>
      )}
      {event && data.reduce((a, d) => a + d.psi.length, 0) === 0 && <Text type="secondary">{t("components.single-cell.splicing.no-cells")}</Text>}
      <Text type="secondary" style={{ fontSize: 12 }}>
        {data.map((d) => `${d.patient}: ${d.psi.length} cells`).join(" · ")}
      </Text>
      {/* pooled PSI per patient, for the record */}
      <Text type="secondary" style={{ fontSize: 12 }}>
        {t("components.single-cell.splicing.pooled")}{" "}
        {event
          ? patients
              .map((p) => {
                const { psi, reads } = eventPsi(cluster.usage?.[p]?.counts || [], event);
                return `${p} ${Number.isFinite(psi) ? psi.toFixed(2) : "–"} (${reads})`;
              })
              .join(" · ")
          : "–"}
      </Text>
    </Space>
  );
}
