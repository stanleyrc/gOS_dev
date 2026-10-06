import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Col, Row, Segmented, Select, Space, Typography } from "antd";
import { SwapOutlined, TeamOutlined } from "@ant-design/icons";
import scaActions from "../../../redux/scAnalysis/actions";

const { Text } = Typography;
const OTHERS = "__others__";

/**
 * Groups A and B for RNA comparisons (shared with the server analyses).
 * Compare either values of one field (clone or any categorical Seurat
 * metadata) or the cells currently selected in the tree/heatmap/UMAP.
 * Group B defaults to "all other cells". Groups apply as you change them.
 */
export default function RnaGroupsCard({ summary }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { selectedCellIds, cells, patient } = useSelector((state) => state.SingleCell);
  const pid = patient?.caseReportId;
  const [mode, setMode] = useState("field");
  const [field, setField] = useState("clone");
  const [aValues, setAValues] = useState([]);
  const [bValues, setBValues] = useState([OTHERS]);

  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const categorical = summary.fields.filter((f) => !f.numeric);
  const fieldLabel = (name) => (name === "clone" ? t("components.single-cell.umap.color-clone") : name);
  const valueOf = (c, name = field) =>
    name === "clone" ? (c.cell_id ? cloneOf.get(c.cell_id) ?? null : null) : c[name] ?? null;

  const levels = useMemo(() => {
    const counts = new Map();
    summary.cells.forEach((c) => {
      const v = valueOf(c);
      if (v != null && v !== "") counts.set(`${v}`, (counts.get(`${v}`) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, field, cloneOf]);

  // Default A to the largest level whenever the field changes.
  useEffect(() => {
    setAValues(levels.length ? [levels[0][0]] : []);
    setBValues([OTHERS]);
  }, [field, levels]);

  const selected = useMemo(() => new Set(selectedCellIds), [selectedCellIds]);
  const groups = useMemo(() => {
    const all = summary.cells;
    const inValues = (vals) => (c) => vals.includes(`${valueOf(c)}`);
    let a;
    let labelA;
    if (mode === "selection") {
      a = all.filter((c) => c.cell_id && selected.has(c.cell_id));
      labelA = t("components.single-cell.rna.selected-cells");
    } else {
      a = all.filter(inValues(aValues));
      labelA = `${fieldLabel(field)}: ${aValues.join(", ")}`;
    }
    const aIds = new Set(a.map((c) => c.displayId));
    let b;
    let labelB;
    if (bValues.includes(OTHERS) || !bValues.length) {
      b = all.filter((c) => !aIds.has(c.displayId) && (mode === "selection" || valueOf(c) != null));
      labelB = t("components.single-cell.rna.all-other");
    } else {
      b = all.filter(inValues(bValues));
      labelB = `${fieldLabel(field)}: ${bValues.join(", ")}`;
    }
    const overlap = b.filter((c) => aIds.has(c.displayId)).length;
    return { a: a.map((c) => c.displayId), b: b.map((c) => c.displayId), labelA, labelB, overlap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, mode, field, aValues, bValues, selected, cloneOf]);

  // Apply to the shared groups as they change.
  useEffect(() => {
    dispatch(scaActions.setGroup("A", groups.a.length ? [{ patient: pid, cells: groups.a }] : [], groups.labelA));
    dispatch(scaActions.setGroup("B", groups.b.length ? [{ patient: pid, cells: groups.b }] : [], groups.labelB));
  }, [dispatch, groups, pid]);

  const levelOptions = levels.map(([level, n]) => ({ value: level, label: `${level} (${n})` }));
  const swap = () => {
    if (mode !== "field" || bValues.includes(OTHERS)) return;
    const a = aValues;
    setAValues(bValues);
    setBValues(a);
  };

  return (
    <Card size="small" title={<Space><TeamOutlined />{t("components.single-cell.rna.groups-title")}</Space>}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.rna.compare-by")}</Text>
          <Segmented
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              { value: "field", label: t("components.single-cell.rna.mode-field") },
              { value: "selection", label: t("components.single-cell.rna.mode-selection", { count: selectedCellIds.length }) },
            ]}
          />
          {mode === "field" && (
            <Select
              size="small"
              style={{ width: 200 }}
              value={field}
              onChange={setField}
              showSearch
              options={[
                { value: "clone", label: t("components.single-cell.umap.color-clone") },
                ...categorical.map((f) => ({ value: f.name, label: f.name })),
              ]}
            />
          )}
        </Space>
        <Row gutter={[16, 8]} align="middle">
          <Col xs={24} lg={11}>
            <div className="sc-group-box sc-group-a">
              <Text strong>A</Text>
              {mode === "selection" ? (
                <Text>{t("components.single-cell.rna.selection-a", { count: groups.a.length })}</Text>
              ) : (
                <Select
                  size="small"
                  mode="multiple"
                  style={{ flex: 1, minWidth: 200 }}
                  value={aValues}
                  onChange={setAValues}
                  options={levelOptions}
                  placeholder={t("components.single-cell.rna.pick-values")}
                />
              )}
              <Text type="secondary">{t("components.single-cell.rna.n-cells", { count: groups.a.length })}</Text>
            </div>
          </Col>
          <Col xs={24} lg={2} style={{ textAlign: "center" }}>
            <Space direction="vertical" size={0} align="center">
              <Text type="secondary">vs</Text>
              {mode === "field" && !bValues.includes(OTHERS) && (
                <Button size="small" type="text" icon={<SwapOutlined />} onClick={swap} title={t("components.single-cell.compare.swap")} />
              )}
            </Space>
          </Col>
          <Col xs={24} lg={11}>
            <div className="sc-group-box sc-group-b">
              <Text strong>B</Text>
              <Select
                size="small"
                mode="multiple"
                style={{ flex: 1, minWidth: 200 }}
                value={bValues}
                onChange={(value) => {
                  // "All other cells" and specific values are exclusive.
                  const last = value[value.length - 1];
                  setBValues(last === OTHERS || !value.length ? [OTHERS] : value.filter((v) => v !== OTHERS));
                }}
                options={[
                  { value: OTHERS, label: t("components.single-cell.rna.all-other") },
                  ...(mode === "field" ? levelOptions : []),
                ]}
              />
              <Text type="secondary">{t("components.single-cell.rna.n-cells", { count: groups.b.length })}</Text>
            </div>
          </Col>
        </Row>
        {groups.overlap > 0 && (
          <Alert type="warning" showIcon message={t("components.single-cell.rna.overlap", { count: groups.overlap })} />
        )}
        {mode === "selection" && !groups.a.length && (
          <Text type="secondary">{t("components.single-cell.rna.selection-help")}</Text>
        )}
      </Space>
    </Card>
  );
}
