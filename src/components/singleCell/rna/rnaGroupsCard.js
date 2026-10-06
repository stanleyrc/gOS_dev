import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Card, Select, Space, Tag, Typography } from "antd";
import { SwapOutlined, TeamOutlined } from "@ant-design/icons";
import scaActions from "../../../redux/scAnalysis/actions";

const { Text } = Typography;

/**
 * Groups A and B for RNA comparisons (shared with the server analyses):
 * from the current selection (tree, heatmap, UMAP lasso), a clone, or any
 * categorical metadata value. Cells are gOS cell IDs, or RNA barcodes for
 * cells without a DNA profile.
 */
export default function RnaGroupsCard({ summary }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { selectedCellIds, cells, patient } = useSelector((state) => state.SingleCell);
  const groups = useSelector((state) => state.ScAnalysis.groups);
  const [field, setField] = useState("clone");
  const pid = patient?.caseReportId;

  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const categorical = summary.fields.filter((f) => !f.numeric);
  const valueOf = (c) =>
    field === "clone" ? (c.cell_id ? cloneOf.get(c.cell_id) ?? null : null) : c[field] ?? null;
  const levels = useMemo(() => {
    const counts = new Map();
    summary.cells.forEach((c) => {
      const v = valueOf(c);
      if (v != null && v !== "") counts.set(`${v}`, (counts.get(`${v}`) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, field, cloneOf]);

  const set = (side, ids, label) =>
    dispatch(scaActions.setGroup(side, ids.length ? [{ patient: pid, cells: ids }] : [], label));
  const idsWhere = (pred) => summary.cells.filter(pred).map((c) => c.displayId);
  const fieldLabel = field === "clone" ? t("components.single-cell.umap.color-clone") : field;
  const setLevel = (side, level) =>
    set(side, idsWhere((c) => `${valueOf(c)}` === level), `${fieldLabel}: ${level}`);
  const setRest = (level) =>
    set("B", idsWhere((c) => valueOf(c) != null && `${valueOf(c)}` !== level), t("components.single-cell.rna.rest-of", { level }));
  const groupIds = (g) => g?.groups?.flatMap((x) => x.cells) || [];
  const selectionB = () => {
    const a = new Set(groupIds(groups.A));
    set("B", summary.cells.map((c) => c.displayId).filter((id) => !a.has(id)), t("components.single-cell.rna.all-other"));
  };

  const groupTag = (side) =>
    groups[side] ? (
      <Tag color={side === "A" ? "magenta" : "blue"} closable onClose={() => set(side, [], null)}>
        {side}: {groups[side].label} ({groups[side].nCells})
      </Tag>
    ) : (
      <Text type="secondary">{t("components.single-cell.rna.unset", { side })}</Text>
    );

  return (
    <Card size="small" title={<Space><TeamOutlined />{t("components.single-cell.rna.groups-title")}</Space>}>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Space wrap>
          {groupTag("A")}
          {groupTag("B")}
          <Button
            size="small"
            icon={<SwapOutlined />}
            disabled={!groups.A && !groups.B}
            onClick={() => {
              const { A, B } = groups;
              set("A", groupIds(B), B?.label);
              set("B", groupIds(A), A?.label);
            }}
          >
            {t("components.single-cell.compare.swap")}
          </Button>
        </Space>
        <Space wrap>
          <Text type="secondary">
            {t("components.single-cell.rna.from-selection", { count: selectedCellIds.length })}
          </Text>
          <Button size="small" disabled={!selectedCellIds.length} onClick={() => set("A", selectedCellIds, t("components.single-cell.rna.selection"))}>
            {t("components.single-cell.rna.set", { side: "A" })}
          </Button>
          <Button size="small" disabled={!selectedCellIds.length} onClick={() => set("B", selectedCellIds, t("components.single-cell.rna.selection"))}>
            {t("components.single-cell.rna.set", { side: "B" })}
          </Button>
          <Button size="small" disabled={!groups.A} onClick={selectionB}>
            {t("components.single-cell.rna.b-rest")}
          </Button>
        </Space>
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.rna.from-field")}</Text>
          <Select
            size="small"
            style={{ width: 190 }}
            value={field}
            onChange={setField}
            options={[
              { value: "clone", label: t("components.single-cell.umap.color-clone") },
              ...categorical.map((f) => ({ value: f.name, label: f.name })),
            ]}
          />
        </Space>
        <Space size={[4, 6]} wrap>
          {levels.map(([level, n]) => (
            <Space key={level} size={2} className="sc-level">
              <Text>{level}</Text>
              <Text type="secondary">({n})</Text>
              <Button size="small" type="link" onClick={() => setLevel("A", level)}>A</Button>
              <Button size="small" type="link" onClick={() => setLevel("B", level)}>B</Button>
              <Button size="small" type="link" onClick={() => { setLevel("A", level); setRest(level); }}>
                {t("components.single-cell.rna.vs-rest")}
              </Button>
            </Space>
          ))}
        </Space>
      </Space>
    </Card>
  );
}
