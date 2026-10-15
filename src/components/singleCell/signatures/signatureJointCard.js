import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Card, Empty, Select, Segmented, Space, Table, Tag, Tooltip, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import { AetiologyLegend, signatureColorOf } from "../signaturePanel";
import useContainerWidth from "../useContainerWidth";
import {
  FIT_JOINT,
  FIT_LEGACY,
  contrastRows,
  contrastsOf,
  droppedSignatures,
  exposureBars,
  fmtDiff,
  fmtP,
  jointSetNames,
  patientSet,
  sigFitMode,
} from "../../../helpers/singleCell/signatureJoint";

const { Text } = Typography;
const ROW_H = 20;
const LABEL_W = 70;
const pct = (x) => `${(100 * x).toFixed(0)}%`;
const pct1 = (x) => `${(100 * x).toFixed(1)}%`;

/** Exposure fractions of one set with bootstrap 95% CI whiskers. */
function ExposureWhiskers({ bars, width }) {
  const barW = Math.max(120, width - LABEL_W - 150);
  const max = Math.max(0.05, ...bars.map((b) => b.hi || b.fraction));
  const x = (v) => LABEL_W + (Math.min(v, max) / max) * barW;
  return (
    <svg width={width} height={bars.length * ROW_H + 8} role="img" aria-label="Exposure fractions with bootstrap 95% confidence intervals">
      {bars.map((b, i) => (
        <g key={b.signature} transform={`translate(0, ${i * ROW_H + 4})`}>
          <text x={LABEL_W - 6} y={ROW_H / 2} dy="0.35em" textAnchor="end" fontSize={12} fill="currentColor">{b.signature}</text>
          <rect x={LABEL_W} y={3} width={Math.max(1, x(b.fraction) - LABEL_W)} height={ROW_H - 8} fill={signatureColorOf(b.signature)} opacity={0.9}>
            <title>{`${b.signature}: ${pct(b.fraction)} (${Math.round(b.count)} mutations), 95% CI ${pct(b.lo)} to ${pct(b.hi)}`}</title>
          </rect>
          <g stroke="currentColor" strokeWidth={1.4} fill="none">
            <line x1={x(b.lo)} x2={x(b.hi)} y1={ROW_H / 2} y2={ROW_H / 2} />
            <line x1={x(b.lo)} x2={x(b.lo)} y1={ROW_H / 2 - 4} y2={ROW_H / 2 + 4} />
            <line x1={x(b.hi)} x2={x(b.hi)} y1={ROW_H / 2 - 4} y2={ROW_H / 2 + 4} />
          </g>
          <text x={LABEL_W + barW + 10} y={ROW_H / 2} dy="0.35em" fontSize={12} fill="currentColor" opacity={0.75}>{`${pct(b.fraction)} [${pct(b.lo)}, ${pct(b.hi)}]`}</text>
        </g>
      ))}
    </svg>
  );
}

/**
 * Joint (patient signature set) signature fit: the Fit switch (joint / legacy,
 * default joint when signatures_joint.json exists), how the signature set was
 * chosen, exposure bars with bootstrap CIs and the subclonal / private / clone /
 * clade vs truncal difference tables. The other Signatures cards read the fit
 * chosen here (redux `signatures`).
 */
export default function SignatureJointCard() {
  const dispatch = useDispatch();
  const { signaturesJoint, layout } = useSelector((s) => s.SingleCell);
  const joint = signaturesJoint?.status === "ok" ? signaturesJoint.data : null;
  const mode = sigFitMode(layout, Boolean(joint));
  const [ref, width] = useContainerWidth(900);
  const [setName, setSetName] = useState("subclonal");
  const [contrastIdx, setContrastIdx] = useState(0);
  const names = useMemo(() => jointSetNames(joint), [joint]);
  const shown = names.includes(setName) ? setName : names[0];
  const bars = useMemo(() => exposureBars(joint, shown), [joint, shown]);
  const set = (joint?.sets || []).find((s) => s.name === shown);
  const members = useMemo(() => patientSet(joint), [joint]);
  const dropped = useMemo(() => droppedSignatures(joint), [joint]);
  const contrasts = contrastsOf(joint);
  const contrast = contrasts[Math.min(contrastIdx, Math.max(0, contrasts.length - 1))];
  const rows = useMemo(() => contrastRows(contrast).map((r) => ({ key: r.signature, ...r })), [contrast]);

  if (!joint) {
    return (
      <Card size="small" title={<Space><ExperimentOutlined />Joint signature fit</Space>}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (signatures_joint.json is not exported for this patient; srctools gos_sc_upload.R STEPS=signatures_joint). The legacy independent fits are shown below." />
      </Card>
    );
  }
  const columns = [
    { title: "Signature", dataIndex: "signature", render: (s) => <Tag color={signatureColorOf(s)} style={{ color: "#fff" }}>{s}</Tag> },
    { title: `${contrast?.a || ""} fraction`, dataIndex: "frac_a", render: pct, align: "right" },
    { title: `${contrast?.b || ""} fraction`, dataIndex: "frac_b", render: pct, align: "right" },
    { title: "Difference [95% CI]", dataIndex: "diff", render: (_, r) => <Text strong={r.significant}>{fmtDiff(r)}</Text>, align: "right" },
    { title: "p", dataIndex: "p", render: fmtP, align: "right" },
    { title: "q (BH)", dataIndex: "q", render: (q, r) => <Text strong={r.significant} type={r.significant ? "danger" : undefined}>{fmtP(q)}</Text>, align: "right" },
  ];
  return (
    <Card
      size="small"
      title={<Space><ExperimentOutlined />Joint signature fit (patient signature set)</Space>}
      extra={
        <Tooltip title="Joint: every site set is refit by NNLS on one signature set chosen for the patient. Independent (legacy): each set was fit alone against all of COSMIC, so small sets can pick spurious signatures. The other cards on this tab use the fit chosen here.">
          <Segmented
            size="small"
            value={mode}
            onChange={(v) => dispatch(singleCellActions.updateLayout({ sigFit: v }))}
            options={[{ value: FIT_JOINT, label: "Fit: joint (patient set)" }, { value: FIT_LEGACY, label: "independent (legacy)" }]}
          />
        </Tooltip>
      }
    >
      <div ref={ref}>
        <Space wrap size={[4, 6]} style={{ marginBottom: 8 }}>
          <Text strong>Patient signature set</Text>
          {members.map((m) => (
            <Tooltip key={m.signature} title={`${m.source === "base" ? "Base set: " : "Added from a subset: "}${m.detail}${m.stability != null ? ` (bootstrap support ${pct(m.stability)})` : ""}`}>
              <Tag color={m.source === "base" ? "default" : "blue"}>{m.signature}{m.source === "base" ? "" : ` (+${m.set})`}</Tag>
            </Tooltip>
          ))}
        </Space>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message={
            <span>
              The set starts from the SigProfilerAssignment fit of all sites and adds a signature only when one subset (truncal, subclonal, private, a
              clone or a clade) supports it by a likelihood-ratio test (Bonferroni over candidates) and the same signature is selected in at least
              80% of {joint.n_boot_select} bootstrap resamples of that subset, takes at least 5% of the exposure and raises the cosine of the
              reconstruction by at least 0.02. Every set is then refit by NNLS on this set only; intervals are {joint.n_boot} mutation-resampling
              bootstraps.
            </span>
          }
        />
        {dropped.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <Text strong>Reported by the independent (legacy) fits but not in the patient set</Text>
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => `${r.signature}|${r.set}`}
              dataSource={dropped.flatMap((d) => (d.checks.length ? d.checks.map((c) => ({ signature: d.signature, ...c })) : [{ signature: d.signature, set: d.sets.join(", ") }]))}
              columns={[
                { title: "Signature", dataIndex: "signature" },
                { title: "Set", dataIndex: "set" },
                { title: "Fraction if added [95% CI]", render: (_, r) => (r.frac == null ? "–" : `${pct1(r.frac)} [${pct1(r.lo)}, ${pct1(r.hi)}]`) },
                { title: "delta logL / p", render: (_, r) => (r.frac == null ? "–" : `${r.delta_loglik} / ${fmtP(r.p)}`) },
                { title: "Cosine gain", dataIndex: "cosine_gain", render: (v) => (v == null ? "–" : v.toFixed(3)) },
                { title: "Bootstrap support (>=5%)", dataIndex: "support", render: (v) => (v == null ? "–" : pct(v)) },
              ]}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Evidence for each signature when it is added to the patient set and the set refit: a signature with a CI reaching 0, a cosine gain below 0.02 or support below 80% is not kept.
            </Text>
          </div>
        )}
        <Space wrap style={{ marginBottom: 6 }}>
          <Text>Site set</Text>
          <Select size="small" value={shown} onChange={setSetName} style={{ minWidth: 230 }} options={names.map((n) => ({ value: n, label: n }))} />
          {set && <Text type="secondary">{`${set.n} sites, reconstruction cosine ${set.cosine?.est?.toFixed(3)} [${set.cosine?.lo?.toFixed(3)}, ${set.cosine?.hi?.toFixed(3)}]`}</Text>}
        </Space>
        {set?.definition && <div><Text type="secondary" style={{ fontSize: 12 }}>{set.definition}</Text></div>}
        {bars.length ? <ExposureWhiskers bars={bars} width={Math.max(360, width - 8)} /> : <Text type="secondary">not available (set has too few mutations to fit)</Text>}
        <AetiologyLegend rows={[{ name: shown, activities: bars.map((b) => ({ signature: b.signature, activity: b.count })) }]} />

        <div style={{ marginTop: 12 }}>
          <Space wrap style={{ marginBottom: 6 }}>
            <Text strong>Difference in exposure fraction vs truncal</Text>
            <Select
              size="small"
              value={Math.min(contrastIdx, Math.max(0, contrasts.length - 1))}
              onChange={setContrastIdx}
              style={{ minWidth: 250 }}
              options={contrasts.map((c, i) => ({ value: i, label: `${c.contrast} (${c.n_a} vs ${c.n_b} sites)` }))}
            />
          </Space>
          {rows.length ? (
            <Table size="small" pagination={false} dataSource={rows} columns={columns} rowClassName={(r) => (r.significant ? "sc-sig-row" : "")} />
          ) : (
            <Text type="secondary">not available (no contrast with truncal for this patient)</Text>
          )}
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
            Difference = fraction in the first set minus truncal; CI and p from independent bootstraps of the two sets (two-sided, +1 corrected); q is
            Benjamini-Hochberg across the patient set. Bold rows have a CI that excludes 0 and q at most 0.05.
          </Text>
        </div>
      </div>
    </Card>
  );
}
