import React, { useMemo } from "react";
import { Card, Empty, Skeleton, Table, Tag, Typography } from "antd";
import { describeDosage, expectedSign } from "../../../helpers/singleCell/eventDosage";
import { binOfCn, intCnBins } from "../../../helpers/singleCell/cnExpression";
import { formatP } from "../../../helpers/singleCell/tests";
import HintLine from "../hintLine";
import Violins from "../violins";

const { Text } = Typography;
const COL_CAR = "#D7191C";
const COL_OTHER = "#8c8c8c";
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "–");

/**
 * Cis dosage of one copy-number event: expression of the event's OWN gene in carriers vs non-carriers inside each patient,
 * and per-cell gene-locus copy number vs that gene's expression (Spearman, Stouffer across patients), with violins by
 * carrier status and by copy-number level. Counterpart of the forest plot above it, which is the trans state association.
 */
export default function CohortEventDosageCard({ result, loading, progress }) {
  const ok = useMemo(() => (result?.perPatient || []).filter((r) => r.status === "ok"), [result]);
  const carrierGroups = useMemo(
    () => ok.flatMap((r) => [
      { key: `${r.patient}|car`, label: "carriers", sublabel: `n=${r.nCarriers}`, color: COL_CAR, values: r.car, cluster: r.patient },
      { key: `${r.patient}|non`, label: "others", sublabel: `n=${r.nOthers}`, color: COL_OTHER, values: r.non, cluster: r.patient },
    ]),
    [ok]
  );
  const cnGroups = useMemo(() => {
    const bins = intCnBins();
    const groups = bins.map((b) => ({ key: b.label, label: b.label, color: "#4575B4", values: [] }));
    ok.forEach((r) => r.cn.forEach((c, i) => {
      const k = binOfCn(bins, c, true);
      if (k >= 0) groups[k].values.push(r.ex[i]);
    }));
    return groups.filter((g) => g.values.length >= 3).map((g) => ({ ...g, sublabel: `n=${g.values.length}` }));
  }, [ok]);
  const title = result ? `Dosage (cis): ${result.event.gene} expression in carriers of ${result.event.label}` : "Dosage (cis)";
  if (!result) {
    return (
      <Card size="small" title="Dosage (cis)">
        {loading ? <Skeleton active paragraph={{ rows: 2 }} title={false} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={progress != null ? `Computing cis dosage… ${progress}%` : "not available (dosage is computed for amplification and deletion events once RNA and copy number are read)"} />}
      </Card>
    );
  }
  const exp = expectedSign(result.event.cls);
  const columns = [
    { title: "Patient", dataIndex: "patient", render: (v, r) => <Text strong={r.pooled}>{v}</Text> },
    { title: "Carriers / others", key: "n", align: "right", render: (_, r) => (r.status === "ok" ? `${r.nCarriers} / ${r.nOthers}` : "") },
    { title: "Mean expr, carriers", key: "mc", align: "right", render: (_, r) => (r.status === "ok" ? f2(r.meanCarriers) : "") },
    { title: "Mean expr, others", key: "mo", align: "right", render: (_, r) => (r.status === "ok" ? f2(r.meanOthers) : "") },
    { title: "p (carriers vs others)", key: "p", align: "right", render: (_, r) => (r.status === "ok" ? (Number.isFinite(r.p) ? formatP(r.p) : "–") : r.pooled ? `Stouffer z ${f2(r.carrierZ)}, ${formatP(r.carrierP)}` : "") },
    { title: "CN vs expr rho (p, cells)", key: "rho", align: "right", render: (_, r) => (r.status === "ok" ? (Number.isFinite(r.rho) ? `${f2(r.rho)} (${formatP(r.rhoP)}, ${r.rhoN})` : "–") : r.pooled ? `${f2(r.rho)} (${formatP(r.rhoP)})` : "") },
    {
      title: "Note",
      key: "note",
      render: (_, r) => (r.status === "ok" ? (exp && r.sign === exp ? <Tag color="green">expected direction</Tag> : exp ? (r.sign ? <Tag>opposite</Tag> : <Tag>no difference</Tag>) : null) : r.pooled ? null : <Text type="secondary">{`not available (${r.reason})`}</Text>),
    },
  ];
  const c = result.combined;
  const data = [...result.perPatient.map((r) => ({ ...r, key: r.patient })), { key: "_all", patient: "Stouffer across patients", pooled: true, status: "pooled", rho: c.rho, rhoP: c.rhoP, carrierZ: c.carrierZ, carrierP: c.carrierP }];
  return (
    <Card size="small" title={<span>{title} <Tag color="blue" style={{ marginLeft: 6 }}>dosage (cis)</Tag></span>}>
      <Text type="secondary" style={{ display: "block", marginBottom: 6 }}>{describeDosage(result)}</Text>
      <Table size="small" pagination={false} dataSource={data} columns={columns} scroll={{ x: true }} />
      {carrierGroups.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Text strong>{`${result.event.gene} expression: carriers vs other tumour cells, per patient`}</Text>
          <Violins groups={carrierGroups} height={240} yTitle={`${result.event.gene} (log-normalized)`} showDetected />
        </div>
      )}
      {cnGroups.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Text strong>{`${result.event.gene} expression by ${result.event.gene} locus copy number (all listed patients pooled; rounded total CN of each cell's genome graph)`}</Text>
          <Violins groups={cnGroups} height={240} yTitle={`${result.event.gene} (log-normalized)`} showDetected />
        </div>
      )}
      <HintLine text="Dosage (cis) tests the event's own gene: do carriers express more (amp / gain) or less (homdel / loss) of it, and does expression follow the per-cell copy number at its locus? The forest plot above is the state association (trans): carriers vs non-carriers on cell state and programs. Tumour cells with matched RNA and genome graph only; carriers are the cells of the patient's filtered events of that gene and class (before the Clade F1 filter)." />
    </Card>
  );
}
