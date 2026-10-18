import React from "react";
import { Button, Segmented, Space, Tooltip } from "antd";
import { AimOutlined, DragOutlined, MinusOutlined, PlusOutlined, SelectOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

/**
 * Overlay buttons on a UMAP plot: zoom in / out / reset, 2-D pan vs select
 * mode, and the 2D / 3D switch (disabled with a reason when unavailable).
 */
export default function UmapViewControls({
  onZoomIn,
  onZoomOut,
  onReset,
  zoom = null,
  mode = null,
  onMode = null,
  dim = "2d",
  onDim = null,
  dimDisabledReason = null,
  showDim = true,
}) {
  const { t } = useTranslation("common");
  return (
    <div className="sc-umap-controls" onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <Space size={4} wrap={false}>
        {showDim && onDim && (
          <Tooltip title={dimDisabledReason || null}>
            <span>
              <Segmented
                size="small"
                value={dim}
                onChange={onDim}
                options={[
                  { value: "2d", label: "2D" },
                  { value: "3d", label: "3D", disabled: Boolean(dimDisabledReason) },
                ]}
              />
            </span>
          </Tooltip>
        )}
        {mode && onMode && (
          <Segmented
            size="small"
            value={mode}
            onChange={onMode}
            options={[
              { value: "select", icon: <Tooltip title={t("components.single-cell.umap.mode-select")}><SelectOutlined /></Tooltip> },
              { value: "pan", icon: <Tooltip title={t("components.single-cell.umap.mode-pan")}><DragOutlined /></Tooltip> },
            ]}
          />
        )}
        <Tooltip title={t("components.single-cell.umap.zoom-in")}><Button size="small" icon={<PlusOutlined />} onClick={onZoomIn} /></Tooltip>
        <Tooltip title={t("components.single-cell.umap.zoom-out")}><Button size="small" icon={<MinusOutlined />} onClick={onZoomOut} /></Tooltip>
        <Tooltip title={t("components.single-cell.umap.zoom-reset")}><Button size="small" icon={<AimOutlined />} onClick={onReset} /></Tooltip>
        {zoom != null && <span className="sc-umap-zoomlabel">{zoom}</span>}
      </Space>
    </div>
  );
}
