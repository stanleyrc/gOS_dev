import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Space, Switch, Tooltip, Typography } from "antd";
import singleCellActions from "../../../redux/singleCell/actions";
import { useSnvFilters } from "../../../helpers/singleCell/signatureFilter";
import useSigSiteFilter from "./useSigSiteFilter";

const { Text } = Typography;

/** "Use SNV filters" toggle and the N of M sites note for the Signatures tab. */
export default function SigFilterBar() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const layout = useSelector((s) => s.SingleCell.layout) || {};
  const { n, m, active } = useSigSiteFilter();
  const on = useSnvFilters(layout);
  return (
    <Space wrap size={8} style={{ marginBottom: 8 }}>
      <Tooltip title={t("components.single-cell.signatures.use-filters-tip")}>
        <Space size={6}>
          <Switch size="small" checked={on} onChange={(v) => dispatch(singleCellActions.updateLayout({ sigUseSnvFilters: v }))} />
          <Text>{t("components.single-cell.signatures.use-filters")}</Text>
        </Space>
      </Tooltip>
      <Text type="secondary">
        {on && active ? t("components.single-cell.signatures.filter-count", { n, m }) : t("components.single-cell.signatures.filter-off", { m })}
      </Text>
      {on && active && <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.signatures.filter-note")}</Text>}
    </Space>
  );
}
