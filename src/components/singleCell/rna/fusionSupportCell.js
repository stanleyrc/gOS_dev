import React from "react";
import { Space, Tag, Tooltip } from "antd";
import { supportText } from "../../../helpers/singleCell/fusionSupport";

const compact = (v) => (v == null ? "?" : v >= 10000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : v.toLocaleString("en-US"));

/**
 * Compact "Support" cell: DNA ✓ (n cells), RNA ✓ (n cells, reads) or both;
 * DNA that only joins the upstream flank of a partner is shown dashed as
 * "upstream-only DNA". `support` is the object from fusionSupport().
 */
export default function FusionSupportCell({ support: s }) {
  if (!s || s.kind === "none") return "–";
  return (
    <Tooltip title={supportText(s)}>
      <Space size={2} wrap={false} style={{ whiteSpace: "nowrap" }} data-testid="fusion-support" data-kind={s.kind}>
        {s.hasDna && (
          <Tag color={s.upstreamOnly ? "default" : "blue"} style={{ marginInlineEnd: 0, borderStyle: s.upstreamOnly ? "dashed" : undefined }}>
            {s.upstreamOnly ? "upstream-only DNA" : "DNA ✓"}
            {s.dnaCells != null ? ` ${compact(s.dnaCells)}` : ""}
          </Tag>
        )}
        {s.hasRna && (
          <Tag color="green" style={{ marginInlineEnd: 0 }}>
            {`RNA ✓ ${compact(s.rnaCells)}`}
            {s.rnaReads ? ` · ${compact(s.rnaReads)} reads` : ""}
          </Tag>
        )}
        {s.kind === "both" && <Tag color="gold" style={{ marginInlineEnd: 0 }}>both</Tag>}
      </Space>
    </Tooltip>
  );
}
