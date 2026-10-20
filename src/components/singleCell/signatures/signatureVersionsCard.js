import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Card, Empty, Select, Space, Tag, Tooltip, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import useContainerWidth from "../useContainerWidth";
import { signatureColorOf } from "../signaturePanel";
import useSignatureVersions, { NOT_EXPORTED } from "./signatureVersionsData";
import {
  DEFAULT_VERSION,
  fmtCosine,
  resolveVersionId,
  versionActivities,
  versionList,
} from "../../../helpers/singleCell/signatureVersions";

const { Text, Paragraph } = Typography;
const ROW_H = 20;
const LABEL_W = 70;
const pct = (x) => `${(100 * x).toFixed(0)}%`;
const n0 = (x) => (x == null ? "n/a" : Math.round(x).toLocaleString("en-US"));

/** Exposure fractions of one set with 95% CI whiskers (bar = share of the set's SNVs). */
function CiBars({ bars, width }) {
  const barW = Math.max(100, width - LABEL_W - 200);
  const max = Math.max(0.05, ...bars.map((b) => b.hi ?? b.fraction));
  const x = (v) => LABEL_W + (Math.min(v, max) / max) * barW;
  return (
    <svg width={width} height={bars.length * ROW_H + 8} role="img" aria-label="Signature exposure fractions with 95% confidence intervals">
      {bars.map((b, i) => (
        <g key={b.signature} transform={`translate(0, ${i * ROW_H + 4})`}>
          <text x={LABEL_W - 6} y={ROW_H / 2} dy="0.35em" textAnchor="end" fontSize={12} fill="currentColor">{b.signature}</text>
          <rect x={LABEL_W} y={3} width={Math.max(1, x(b.fraction) - LABEL_W)} height={ROW_H - 8} fill={signatureColorOf(b.signature)} opacity={0.9}>
            <title>{`${b.signature}: ${pct(b.fraction)}${b.lo != null ? ` (95% CI ${pct(b.lo)} to ${pct(b.hi)})` : ""}${b.count != null ? `, ${n0(b.count)} SNVs` : ""}`}</title>
          </rect>
          {b.lo != null && b.hi != null && (
            <g stroke="currentColor" strokeWidth={1.4}>
              <line x1={x(b.lo)} x2={x(b.hi)} y1={ROW_H / 2} y2={ROW_H / 2} />
              <line x1={x(b.lo)} x2={x(b.lo)} y1={ROW_H / 2 - 4} y2={ROW_H / 2 + 4} />
              <line x1={x(b.hi)} x2={x(b.hi)} y1={ROW_H / 2 - 4} y2={ROW_H / 2 + 4} />
            </g>
          )}
          <text x={LABEL_W + barW + 10} y={ROW_H / 2} dy="0.35em" fontSize={12} fill="currentColor" opacity={0.75}>
            {pct(b.fraction)}{b.lo != null ? ` [${pct(b.lo)}, ${pct(b.hi)}]` : ""} · {n0(b.count)} SNVs
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * Signature-fit versions (signature_versions.json): the same SBS96 fit under several SNV-set definitions. The version
 * toggle (layout.sigVersion, default v2_current) shows that version's exposures with 95% CIs, SNV and singleton counts,
 * reconstruction cosine and the definition; a per-set (legacy) version shows its sets side by side.
 */
export default function SignatureVersionsCard() {
  const dispatch = useDispatch();
  const { data } = useSignatureVersions();
  const wanted = useSelector((s) => s.SingleCell.layout?.sigVersion) || DEFAULT_VERSION;
  const [ref, width] = useContainerWidth(900);
  const list = useMemo(() => versionList(data), [data]);
  const id = resolveVersionId(data, wanted);
  const version = (data?.versions || []).find((v) => v.id === id);
  const info = list.find((v) => v.id === id);
  const acts = useMemo(() => versionActivities(version), [version]);
  const title = <Space><BranchesOutlined />Signature fit versions</Space>;
  if (!data) {
    return (
      <Card size="small" title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={NOT_EXPORTED} />
      </Card>
    );
  }
  const cols = acts.sets.length > 1 ? Math.min(acts.sets.length, 3) : 1;
  const colW = Math.max(300, Math.floor((width - 16 * (cols - 1)) / cols));
  return (
    <Card
      size="small"
      title={title}
      extra={
        <Tooltip title="Each version fits the same COSMIC-based rule (forward selection, NNLS refit, bootstrap) to a different SNV set. Default: v2 = the current joint fit of the tree sites.">
          <Select
            size="small"
            style={{ minWidth: 300 }}
            value={id}
            onChange={(v) => dispatch(singleCellActions.updateLayout({ sigVersion: v }))}
            options={list.map((v) => ({ value: v.id, label: v.available ? v.label : `${v.label} (not available)` }))}
          />
        </Tooltip>
      }
    >
      <div ref={ref}>
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>{info?.definition}</Paragraph>
        {acts.unavailable ? (
          <Alert type="warning" showIcon message={`not available (${acts.unavailable})`} />
        ) : (
          <>
            <Space wrap size={[16, 4]} style={{ marginBottom: 8 }}>
              <Text><b>{n0(info.n)}</b> SNVs</Text>
              <Text><b>{n0(info.nSingleton)}</b> singletons</Text>
              <Tag>{info.mode === "per_set" ? "separate fits per set" : "one joint fit"}</Tag>
              {(version.forced || []).map((f) => <Tag key={f} color="orange">forced artifact column {f}</Tag>)}
            </Space>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {acts.sets.map((s) => (
                <div key={s.name} style={{ width: colW }}>
                  <Space wrap size={[12, 2]} style={{ marginBottom: 4 }}>
                    {acts.sets.length > 1 && <Text strong>{s.name}</Text>}
                    <Text type="secondary">{n0(s.n)} SNVs{s.nSingleton ? `, ${n0(s.nSingleton)} singletons` : ""}</Text>
                    <Tooltip title="Reconstruction cosine of the fitted signatures to the observed 96-channel catalogue (bootstrap 95% CI).">
                      <Text type="secondary">cosine {fmtCosine(s.cosine, s.cosineLo, s.cosineHi)}</Text>
                    </Tooltip>
                  </Space>
                  {s.status !== "ok" ? (
                    <Alert type="warning" showIcon message={`not available (${s.reason || s.status})`} />
                  ) : (
                    <CiBars bars={s.bars} width={colW} />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
