import React, { useMemo } from "react";
import { Space, Tag, Tooltip, Typography } from "antd";
import { metaStrip, patientClinical } from "../../../helpers/singleCell/clinicalConcordance";

const { Text } = Typography;

/** One annotation field: value, or "n/a" with the reason as a tooltip. */
export function MetaField({ f, compact }) {
  const na = f.value == null;
  return (
    <Tooltip title={na ? `not available (${f.why})` : f.tip || undefined}>
      <span style={{ display: "inline-flex", flexDirection: compact ? "row" : "column", gap: compact ? 4 : 0, alignItems: compact ? "baseline" : "flex-start", minWidth: 0 }}>
        <span style={{ fontSize: 11.5, color: "var(--sc-muted, #8c8c8c)", textTransform: "uppercase", letterSpacing: 0.3 }}>{f.label}</span>
        <span style={{ fontSize: 13.5, color: na ? "var(--sc-muted, #8c8c8c)" : undefined }}>
          {na ? "not available" : f.value}
          {!na && f.sub ? <Text type="secondary" style={{ fontSize: 12 }}>{` (${f.sub})`}</Text> : null}
        </span>
      </span>
    </Tooltip>
  );
}

/**
 * Compact clinical strip of one patient: sex, age, location, MGMT, truncal mutations (current tree), the clinical
 * assays with their status and how many reported alterations the single-cell data recovers.
 * `compact` (home card) shows only sex / age / location / MGMT and the assay tags.
 */
export default function ClinicalStrip({ assays, recovery, patient, status, compact = false }) {
  const fields = useMemo(() => metaStrip(assays, patient), [assays, patient]);
  const c = useMemo(() => patientClinical(assays, recovery, patient), [assays, recovery, patient]);
  if (status === "loading") return null;
  if (status === "none") return <Text type="secondary" style={{ fontSize: 13 }}>Clinical data: not available (_cohort/clinical_assays.json not exported)</Text>;
  const shown = compact ? fields.filter((f) => ["sex", "age", "location", "mgmt"].includes(f.key)) : fields;
  const col = { ok: "green", failed: "red", "nothing detected": "default" };
  return (
    <div className="sc-clinical-strip" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Space size={[14, 4]} wrap>
        {shown.map((f) => <MetaField key={f.key} f={f} compact={compact} />)}
      </Space>
      <Space size={[6, 4]} wrap>
        {c.available ? (
          <>
            {c.assays.map((a) => (
              <Tag key={a.assay} color={col[a.status] || "default"} style={{ margin: 0 }}>{`${a.assay}: ${a.status}${a.tmb != null ? `, TMB ${a.tmb}` : ""}`}</Tag>
            ))}
            {c.assessable > 0 && (
              <Tooltip title={`${c.counts.recovered} recovered, ${c.counts.partial} partial, ${c.counts.not_recovered} not recovered, ${c.counts.not_covered} not covered / not assessable, of ${c.counts.total} reported alterations. ${c.missed} single-cell tier 1-2 drivers (in >= 30% of tumour cells) are not in the clinical report.`}>
                <Tag color="blue" style={{ margin: 0, cursor: "help" }}>{`recovered ${c.counts.recovered} of ${c.assessable} assessable`}</Tag>
              </Tooltip>
            )}
          </>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>{`Clinical report: not available (${c.why})`}</Text>
        )}
      </Space>
    </div>
  );
}
