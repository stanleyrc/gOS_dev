import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Card, Select, Space, Tag, Tooltip, Typography } from "antd";
import { FilterOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import { QC_EXCLUDE_RULES, excludedCellIds } from "../../../helpers/singleCell/precompute";

const { Text } = Typography;
const NONE = [];

/**
 * Global cell filter: QC rules (from the precompute QC / S-phase steps) and a
 * manual list. Every tree-aligned view (heatmap, tree, bars, signatures,
 * circos, ecDNA bars) and every RNA view drops the excluded cells.
 */
export default function CellFilterControl() {
  const dispatch = useDispatch();
  const { cells, layout, selectedCellIds } = useSelector((s) => s.SingleCell);
  const rules = layout.qcExcludeRules || NONE;
  const manual = layout.excludedCells || NONE;
  const ids = new Set(cells.map((c) => `${c.cell_id}`));
  const excluded = useMemo(() => excludedCellIds(cells, rules, manual), [cells, rules, manual]);
  const nHere = [...excluded].filter((id) => ids.has(id)).length;
  const manualHere = manual.filter((id) => ids.has(`${id}`));
  const hasQc = cells.some((c) => c.pc_qc_flags != null || c["DNA cycle"] != null);
  const counts = useMemo(
    () => Object.fromEntries(QC_EXCLUDE_RULES.map((r) => [r.value, excludedCellIds(cells, [r.value]).size])),
    [cells]
  );
  const update = (patch) => dispatch(singleCellActions.updateLayout(patch));
  return (
    <Card size="small" bodyStyle={{ padding: "6px 12px" }}>
      <Space wrap size="small">
        <FilterOutlined />
        <Text strong>Cell filter</Text>
        <Select
          mode="multiple"
          size="small"
          style={{ minWidth: 320 }}
          placeholder={hasQc ? "Exclude cells flagged by QC…" : "QC not yet computed"}
          disabled={!hasQc}
          value={rules}
          onChange={(v) => update({ qcExcludeRules: v })}
          options={QC_EXCLUDE_RULES.map((r) => ({ value: r.value, label: `${r.label} (${counts[r.value]})` }))}
        />
        <Tooltip title="Drop the currently selected cells from every view (applies across tabs; undo with Restore)">
          <Button size="small" disabled={!selectedCellIds.length} onClick={() => update({ excludedCells: [...new Set([...manual, ...selectedCellIds.map(String)])] })}>
            Exclude selected ({selectedCellIds.length})
          </Button>
        </Tooltip>
        <Button size="small" disabled={!manualHere.length} onClick={() => update({ excludedCells: manual.filter((id) => !ids.has(`${id}`)) })}>
          Restore manual ({manualHere.length})
        </Button>
        <Tag color={nHere ? "orange" : "default"}>
          {nHere} of {cells.length} cells excluded in every view
        </Tag>
      </Space>
    </Card>
  );
}
