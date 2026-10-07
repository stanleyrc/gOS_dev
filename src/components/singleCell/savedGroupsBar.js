import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Input, Space, Tag, Tooltip, Typography, message } from "antd";
import { LinkOutlined, SaveOutlined } from "@ant-design/icons";
import * as d3 from "d3";
import singleCellActions from "../../redux/singleCell/actions";
import { SAVED_GROUP_FIELD, groupValues, shareUrl } from "../../helpers/singleCell/savedGroups";

const { Text } = Typography;
const groupColor = d3.scaleOrdinal(d3.schemeDark2);

/** The open patient's saved groups and a setter. */
export function useSavedGroups() {
  const dispatch = useDispatch();
  const { layout, patient } = useSelector((state) => state.SingleCell);
  const pid = patient?.caseReportId;
  const all = layout.savedGroups || {};
  const groups = (pid && all[pid]) || [];
  const setGroups = (next) => dispatch(singleCellActions.updateLayout({ savedGroups: { ...all, [pid]: next } }));
  return { pid, groups, setGroups };
}

/**
 * Keep the saved groups as the RNA field "saved_group", so they can be
 * compared (each vs rest / pairwise DE, A vs B) and used to colour the UMAP.
 */
export function useSavedGroupsField() {
  const dispatch = useDispatch();
  const rna = useSelector((state) => state.SingleCell.rna);
  const { groups } = useSavedGroups();
  useEffect(() => {
    if (rna.status !== "ok") return;
    const summary = rna.data;
    const hasField = summary.fields.some((f) => f.name === SAVED_GROUP_FIELD);
    if (!groups.length && !hasField) return;
    const values = groupValues(summary.cells, groups);
    // compare cell values only (levels with no RNA cells never appear), so this settles
    const same = hasField && summary.cells.every((c) => (c[SAVED_GROUP_FIELD] ?? null) === values[c.displayId]);
    if (!same) dispatch(singleCellActions.addRnaField(SAVED_GROUP_FIELD, values));
  }, [dispatch, rna, groups]);
}

/** Save the current selection under a name; saved groups as tags (click to select). */
export default function SavedGroupsBar() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { selectedCellIds } = useSelector((state) => state.SingleCell);
  const { pid, groups, setGroups } = useSavedGroups();
  const [name, setName] = useState("");
  useSavedGroupsField();

  if (!pid || (!groups.length && !selectedCellIds.length)) return null;
  const save = () => {
    const label = name.trim() || t("components.single-cell.saved-groups.default-name", { n: groups.length + 1 });
    setGroups([...groups.filter((g) => g.name !== label), { name: label, cells: [...selectedCellIds] }]);
    setName("");
  };
  const copyLink = async () => {
    const url = shareUrl(pid, groups);
    try {
      await navigator.clipboard.writeText(url);
      message.success(t("components.single-cell.saved-groups.copied"));
    } catch (error) {
      window.prompt(t("components.single-cell.saved-groups.copy-prompt"), url);
    }
  };

  return (
    <Space wrap size={[6, 4]} className="sc-saved-groups">
      <Text type="secondary">{t("components.single-cell.saved-groups.title")}</Text>
      {groups.map((g) => (
        <Tooltip key={g.name} title={t("components.single-cell.saved-groups.tag-help", { count: g.cells.length })}>
          <Tag
            color={groupColor(g.name)}
            closable
            style={{ cursor: "pointer" }}
            onClick={() => dispatch(singleCellActions.updateSelection(g.cells))}
            onClose={(e) => {
              e.preventDefault();
              setGroups(groups.filter((x) => x.name !== g.name));
            }}
          >
            {`${g.name} (${g.cells.length})`}
          </Tag>
        </Tooltip>
      ))}
      {selectedCellIds.length > 0 && (
        <Space.Compact size="small">
          <Input
            size="small"
            style={{ width: 160 }}
            placeholder={t("components.single-cell.saved-groups.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={save}
          />
          <Button size="small" icon={<SaveOutlined />} onClick={save}>
            {t("components.single-cell.saved-groups.save", { count: selectedCellIds.length })}
          </Button>
        </Space.Compact>
      )}
      {groups.length > 0 && (
        <Tooltip title={t("components.single-cell.saved-groups.link-help")}>
          <Button size="small" type="text" icon={<LinkOutlined />} onClick={copyLink}>
            {t("components.single-cell.saved-groups.link")}
          </Button>
        </Tooltip>
      )}
    </Space>
  );
}
