import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Select, Space, Typography } from "antd";
import singleCellActions from "../../redux/singleCell/actions";
import { genePrefixMatch, geneSelectOptions } from "../../helpers/singleCell/pinGenes";

const { Text } = Typography;

/* Gene-pin picker. State is layout.pinnedGenes in the SingleCell store, so every
   instance (heatmap toolbar, cell-tracks toggle row) shows the same pins. */
export default function PinGenesControl({ maxWidth = 340 }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const pinned = useSelector((state) => state.SingleCell.layout.pinnedGenes);
  const optionsList = useSelector((state) => state.Genes.optionsList);
  const options = React.useMemo(() => geneSelectOptions(optionsList), [optionsList]);
  return (
    <Space size={4} data-pin-genes-control>
      <Text type="secondary">{t("components.single-cell.toolbar.pin")}</Text>
      <Select
        size="small"
        mode="multiple"
        allowClear
        showSearch
        maxTagCount="responsive"
        style={{ minWidth: 150, maxWidth }}
        placeholder={t("components.single-cell.toolbar.pin-placeholder")}
        value={pinned || []}
        onChange={(value) => dispatch(singleCellActions.updateLayout({ pinnedGenes: value }))}
        options={options}
        filterOption={genePrefixMatch}
      />
    </Space>
  );
}
