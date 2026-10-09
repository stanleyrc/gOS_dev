import React from "react";
import { Table, Tag, Tooltip, Typography } from "antd";
import { naturalCompare } from "../../../helpers/singleCell/matrix";
import { geneSetColor } from "../../../helpers/singleCell/figures";

const { Text } = Typography;
const KIND_COLORS = { fusion: "magenta", outframe_fusion: "magenta", AMP: "red", HOMDEL: "blue", SNV: "gold" };

/** Carrier fraction within each clone as small filled boxes (box width ~ clone size). */
function CloneBoxes({ clones, cloneColors }) {
  const total = clones.reduce((s, c) => s + c.n, 0) || 1;
  return (
    <div style={{ display: "flex", gap: 2, width: 150, height: 14, alignItems: "flex-end" }}>
      {clones
        .slice()
        .sort((a, b) => naturalCompare(a.clone, b.clone))
        .map((c) => (
          <Tooltip key={c.clone} title={`${c.clone}: ${c.carriers}/${c.n} cells (${Math.round(100 * c.fraction)}%)`}>
            <div style={{ width: `${(100 * c.n) / total}%`, minWidth: 4, height: 14, background: "rgba(127,127,127,0.15)", position: "relative" }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${100 * c.fraction}%`, background: cloneColors[c.clone] || "#8c8c8c" }} />
            </div>
          </Tooltip>
        ))}
    </div>
  );
}

/**
 * Driver events and amplicon gene sets carried by part of each tumour, whose
 * carriers follow the tree (clade F1). Clicking a row marks the carriers in
 * the patient view.
 */
export default function SubclonalFindingsTable({ findings, cloneColors, selectedKey, onSelect }) {
  const columns = [
    { title: "Patient", dataIndex: "patient", key: "patient", width: 80, sorter: (a, b) => naturalCompare(a.patient, b.patient) },
    {
      title: "Finding",
      key: "label",
      render: (_, r) => (
        <span>
          <Text strong style={{ color: r.kind === "amplicon" ? geneSetColor(r.group.key) : undefined }}>{r.label}</Text>{" "}
          <Tag color={r.kind === "amplicon" ? "purple" : KIND_COLORS[r.type] || "default"} style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: "16px" }}>
            {r.kind === "amplicon" ? `ecDNA · ${r.type}` : r.type}
          </Tag>
        </span>
      ),
    },
    {
      title: "Tumor cells",
      key: "n",
      width: 136,
      sorter: (a, b) => a.fraction - b.fraction,
      render: (_, r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 50, height: 8, background: "rgba(127,127,127,0.15)" }}>
            <div style={{ width: `${100 * r.fraction}%`, height: 8, background: "#595959" }} />
          </div>
          <Text style={{ fontSize: 12, whiteSpace: "nowrap" }}>{`${r.n} · ${Math.round(100 * r.fraction)}%`}</Text>
        </div>
      ),
    },
    {
      title: <Tooltip title="Best F1 between the carriers and one clade of the tree (1 = exactly one clade)">Clade F1</Tooltip>,
      key: "f1",
      width: 78,
      sorter: (a, b) => (a.f1 || 0) - (b.f1 || 0),
      render: (_, r) => (Number.isFinite(r.f1) ? r.f1.toFixed(2) : "–"),
    },
    { title: "Carriers per clone", key: "clones", width: 160, render: (_, r) => <CloneBoxes clones={r.clones} cloneColors={cloneColors} /> },
  ];
  return (
    <Table
      size="small"
      rowKey="key"
      columns={columns}
      dataSource={findings}
      pagination={{ pageSize: 8, hideOnSinglePage: true, size: "small" }}
      onRow={(r) => ({ onClick: () => onSelect?.(r), style: { cursor: "pointer", background: r.key === selectedKey ? "rgba(24,144,255,0.08)" : undefined } })}
    />
  );
}
