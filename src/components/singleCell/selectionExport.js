import React from "react";
import { useSelector } from "react-redux";
import { Button, Dropdown, message } from "antd";
import { CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import { selectedCellsTsv } from "../../helpers/singleCell/cellLabels";
import useCellLabels from "./useCellLabels";

/** Export the selected cells: a TSV (cell id, well, clone, per-cell attributes) or their ids on the clipboard. */
export default function SelectionExport({ size = "small" }) {
  const cellLabels = useCellLabels();
  const { cells, selectedCellIds, patient } = useSelector((s) => s.SingleCell);
  const ids = selectedCellIds || [];
  if (!ids.length) return null;
  const download = () => {
    const url = URL.createObjectURL(new Blob([selectedCellsTsv(ids, cells || [], cellLabels.map)], { type: "text/tab-separated-values" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patient?.caseReportId || "cells"}_selected_${ids.length}_cells.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    const text = ids.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      message.success(`Copied ${ids.length} cell ids`);
    } catch (error) {
      window.prompt("Copy the cell ids", ids.join(","));
    }
  };
  return (
    <Dropdown
      menu={{
        items: [
          { key: "tsv", icon: <DownloadOutlined />, label: `Download TSV (${ids.length} cells: id, well, clone, attributes)`, onClick: download },
          { key: "copy", icon: <CopyOutlined />, label: "Copy cell ids", onClick: copy },
        ],
      }}
    >
      <Button size={size} icon={<DownloadOutlined />}>{`Export ${ids.length} cells`}</Button>
    </Dropdown>
  );
}
