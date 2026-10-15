import React, { useState } from "react";
import { Alert, Card, Empty, Segmented, Skeleton, Space, Table, Tag, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { NEAR_OPTIONS, cohortRows, fmtOr, fmtP, fmtPct } from "../../../helpers/singleCell/mutJunctions";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import HintLine from "../hintLine";
import MutJunctionBinChart from "../signatures/mutJunctionBinChart";
import useCohortExport from "./useCohortExport";

const { Text, Paragraph } = Typography;

/**
 * Mutations near junctions, whole cohort: one row per patient (APOBEC fraction within 100 kb of a junction vs far,
 * odds ratio, junction-shuffle permutation p, kataegis clusters, carrier F1) and a meta row pooling the patients with
 * a patient stratum. Patients without a result say why. Data: _cohort/mut_junctions.json.
 */
export default function CohortMutJunctionsPanel({ dataset, onOpen = null }) {
  const { status, data } = useCohortExport(dataset, "mut_junctions.json");
  const [def, setDef] = useState("tcw");
  const [near, setNear] = useState(1e6);
  if (status === "loading") return <Card size="small" title="Mutations near junctions"><Skeleton active paragraph={{ rows: 3 }} /></Card>;
  const title = <Space><ThunderboltOutlined />Mutations near junctions</Space>;
  if (!data) {
    return (
      <Card size="small" title={title}>
        <Empty description="Not available (_cohort/mut_junctions.json has not been exported; srctools inst/gos_single_cell/mut_junctions.py)." />
      </Card>
    );
  }
  const { patients, meta, heterogeneity, nPatients } = cohortRows(data, def, near);
  const pooled = (data.pooled_bins || []).map((b) => ({
    label: b.label,
    n: b.n,
    k: b[def]?.k ?? 0,
    frac: b[def]?.frac,
    lo: b[def]?.ci?.[0],
    hi: b[def]?.ci?.[1],
    bgFrac: def === "tcw" ? b.background?.frac ?? null : null,
    bgN: def === "tcw" ? b.background?.n ?? null : null,
    bgLo: def === "tcw" ? b.background?.ci?.[0] ?? null : null,
    bgHi: def === "tcw" ? b.background?.ci?.[1] ?? null : null,
  }));
  const noApobec = patients.filter((p) => p.available && !p.apobecInFit).map((p) => p.id);
  return (
    <Card size="small" title={title} extra={<Space size={8}><Segmented size="small" value={near} onChange={setNear} options={NEAR_OPTIONS} /><Segmented size="small" value={def} onChange={setDef} options={[{ value: "tcw", label: "TCW motif" }, { value: "sbs", label: "SBS2/13" }]} /></Space>}>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        {def === "sbs" && noApobec.length > 0 && (
          <Alert type="info" showIcon message={`No SBS2 or SBS13 in the joint signature fit of ${noApobec.join(", ")}: no site is assigned to APOBEC by signature there.`} />
        )}
        {patients.some((p) => p.id === "BWH69" && p.available) && (
          <Alert type="warning" showIcon message="BWH69 SNV set is noisy; a rebuild is pending, so its row is provisional." />
        )}
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={patients}
          onRow={(r) => ({ onClick: () => onOpen && r.available && onOpen(r.id), style: { cursor: onOpen && r.available ? "pointer" : "default" } })}
          columns={[
            { title: "Patient", dataIndex: "id", width: 90, render: (v) => <Text strong style={{ whiteSpace: "nowrap" }}>{v}</Text> },
            {
              title: `Near junction (${near >= 1e6 ? "<= 1 Mb" : "<= 100 kb"})`,
              key: "near",
              render: (_, r) => (r.available ? `${fmtPct(r.near?.frac)} (${r.near?.k}/${r.near?.n})` : <Text type="secondary">Not available ({r.reason})</Text>),
            },
            { title: "Far", key: "far", render: (_, r) => (r.available ? `${fmtPct(r.far?.frac)} (${r.far?.k}/${r.far?.n})` : "") },
            { title: "OR (95% CI)", key: "or", render: (_, r) => (r.available ? fmtOr(r.or) : "") },
            { title: "Fisher p", key: "fp", align: "right", render: (_, r) => (r.available ? fmtP(r.or?.p) : "") },
            { title: "Permutation p", key: "pp", align: "right", render: (_, r) => (r.available ? (r.perm ? fmtP(r.perm.p_one_sided) : def === "tcw" ? "n/a" : "") : "") },
            { title: "Junctions", dataIndex: "nJunctions", align: "right" },
            { title: "Kataegis (strict / relaxed)", key: "k", align: "right", render: (_, r) => (r.available ? `${r.kataegisStrict} / ${r.kataegisRelaxed}` : "") },
            { title: "Carrier F1 (TCW / other)", key: "f1", align: "right", render: (_, r) => (r.available ? `${r.f1?.median != null ? r.f1.median.toFixed(2) : "n/a"} / ${r.f1Other?.median != null ? r.f1Other.median.toFixed(2) : "n/a"}` : "") },
            { title: "SBS2/13 in fit", key: "fit", render: (_, r) => (r.available ? <Tag color={r.apobecInFit ? "green" : "default"}>{r.apobecInFit ? "yes" : "no"}</Tag> : "") },
          ]}
          summary={() =>
            meta.length ? (
              <Table.Summary>
                {meta.map((m) => (
                  <Table.Summary.Row key={m.key} style={{ background: "rgba(22,119,255,0.06)" }}>
                    <Table.Summary.Cell index={0}><Text strong>{m.key === "fixed" ? "Meta" : ""}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} colSpan={2}><Text type="secondary">{m.label}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={3}>{m.or_ != null ? fmtOr(m) : m.z != null ? `z = ${m.z.toFixed(2)}` : ""}</Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">{fmtP(m.p)}</Table.Summary.Cell>
                    <Table.Summary.Cell index={5} colSpan={5} />
                  </Table.Summary.Row>
                ))}
              </Table.Summary>
            ) : null
          }
        />
        <Text style={{ fontSize: TYPE.body }}>
          {nPatients} patients with a usable test. {heterogeneity ? `Heterogeneity Q=${heterogeneity.Q.toFixed(2)}, I2=${fmtPct(heterogeneity.I2, 0)}${heterogeneity.p != null ? `, p=${fmtP(heterogeneity.p)}` : ""}.` : ""}
        </Text>
        <Paragraph style={{ marginBottom: 0 }} strong>Pooled over patients, by distance to the nearest junction</Paragraph>
        <MutJunctionBinChart series={pooled} ariaLabel="Pooled APOBEC fraction by distance to nearest junction" />
        <HintLine text="Near = within 100 kb or 1 Mb (switch above) of a breakpoint of a junction seen in at least 2 tumour cells; far = more than 1 Mb or no junction on the chromosome. Odds ratios compare APOBEC-type sites near vs far (exact CI). The meta rows pool the patients: inverse-variance fixed and DerSimonian-Laird random effects on the log odds ratio, Mantel-Haenszel with patient strata, and Stouffer's z of the per-patient junction-shuffle permutation (weighted by the square root of near sites). Background diamonds are the APOBEC-motif fraction among the genotyped candidate sites in the same bin." />
      </Space>
    </Card>
  );
}
