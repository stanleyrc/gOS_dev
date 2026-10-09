import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Select, Space, Tooltip, Typography } from "antd";
import singleCellActions from "../../../redux/singleCell/actions";
import { rareMaxOf } from "../../../helpers/singleCell/walkPanels";

const { Text } = Typography;
const OPTIONS = [0, 1, 2, 3, 5, 10];

/** The rare-walk threshold every ecDNA panel uses (walks with <= k carrier cells are folded or hidden). */
export function useRareMax() {
  const layout = useSelector((s) => s.SingleCell.layout);
  return rareMaxOf(layout);
}

/** One control for that threshold; any copy of it edits the same shared value. bare: the select alone, without its label. */
export default function RareControl({ bare = false }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const value = useRareMax();
  return (
    <Tooltip title={t("components.single-cell.ecdna.rare-help")}>
      <Space size={4}>
        {!bare && <Text type="secondary">{t("components.single-cell.ecdna.tc-rare")}</Text>}
        <Select
          size="small"
          value={value}
          onChange={(v) => dispatch(singleCellActions.updateLayout({ walkRareMax: v }))}
          style={{ width: 62 }}
          options={OPTIONS.map((v) => ({ value: v, label: v ? `${v}` : t("components.single-cell.ecdna.tc-rare-off") }))}
        />
      </Space>
    </Tooltip>
  );
}
