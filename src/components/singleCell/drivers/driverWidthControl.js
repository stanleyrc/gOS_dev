import React from "react";
import { Button, Slider, Space, Tooltip, Typography } from "antd";
import { AiOutlineFullscreen, AiOutlineZoomIn, AiOutlineZoomOut } from "react-icons/ai";
import { DRIVER_COL_PX_MAX, DRIVER_COL_PX_MIN } from "../../../helpers/singleCell/driverColumns";

const { Text } = Typography;

/**
 * Width of the driver columns (slider 4-40 px per driver, or auto fit) and the zoom
 * buttons of the Drivers layer. The width is kept in the layout (and the URL, drvw=).
 */
export default function DriverWidthControl({ view, colPx, onColPx, onZoom, onResetZoom }) {
  const shown = colPx || Math.max(DRIVER_COL_PX_MIN, Math.min(DRIVER_COL_PX_MAX, Math.round(view?.colWidth || DRIVER_COL_PX_MIN)));
  return (
    <Space size={6} wrap>
      <Text type="secondary">Column width</Text>
      <Slider
        style={{ width: 120, margin: "0 6px" }}
        min={DRIVER_COL_PX_MIN}
        max={DRIVER_COL_PX_MAX}
        value={shown}
        onChange={(v) => onColPx(v)}
        tooltip={{ formatter: (v) => `${v} px per driver` }}
      />
      <Text type="secondary" style={{ minWidth: 38, display: "inline-block" }}>{colPx ? `${colPx} px` : "auto"}</Text>
      <Tooltip title="Fit the columns to the available width (zooming also fits to the view)">
        <Button size="small" type={colPx ? "default" : "primary"} onClick={() => onColPx(null)}>Auto fit</Button>
      </Tooltip>
      <Tooltip title="Zoom in on the driver columns (wheel or pinch over the heatmap; drag to pan)">
        <Button size="small" icon={<AiOutlineZoomIn />} onClick={() => onZoom(0.5)} />
      </Tooltip>
      <Tooltip title="Zoom out">
        <Button size="small" icon={<AiOutlineZoomOut />} onClick={() => onZoom(2)} />
      </Tooltip>
      <Tooltip title="Reset zoom: show all driver columns">
        <Button size="small" icon={<AiOutlineFullscreen />} disabled={!view?.zoomed && !view?.clipped} onClick={onResetZoom} />
      </Tooltip>
    </Space>
  );
}
