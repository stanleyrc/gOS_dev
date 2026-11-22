import React from "react";
import { Tag, Tooltip } from "antd";
import { dataTypeLabel, dataTypeShort, normalizeDataTypes } from "../../helpers/reportDataTypes";

/** Small data-type badges on a home-page report card (scDNA PTA, bulk WGS, ...). */
export default function DataTypeBadges({ types }) {
  if (types == null) return null;
  const list = normalizeDataTypes(types);
  return (
    <span className="data-type-badges" onClick={(e) => e.stopPropagation()}>
      {list.map((v) => (
        <Tooltip key={v} title={`Data type: ${dataTypeLabel(v)}`}>
          <Tag className={`data-type-badge data-type-${v}`} bordered={false}>
            {dataTypeShort(v)}
          </Tag>
        </Tooltip>
      ))}
    </span>
  );
}
