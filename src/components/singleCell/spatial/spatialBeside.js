import React, { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Dropdown, Segmented, Space, Switch, Typography } from "antd";
import useContainerWidth from "../useContainerWidth";
import { SIZE_PRESETS, SPATIAL_SECTIONS, SPLITTER_WIDTH, clampMapWidth, presetOf } from "../../../helpers/singleCell/spatialLayout";
import { sectionTitle, useSpatialLayout } from "./spatialLayoutContext";

/**
 * Heatmap card on the left, tissue map on the right. The map column is sticky
 * (stays in view while the heatmap rows scroll) and a vertical splitter between
 * the two sets its width (committed to layout.spWidth / ?spw= on release).
 */
export default function SpatialBeside({ heatmap, map }) {
  const sp = useSpatialLayout();
  const [rowRef, rowWidth] = useContainerWidth(1400);
  const [dragWidth, setDragWidth] = useState(null);
  const drag = useRef(null);
  const width = dragWidth ?? sp.width;

  useEffect(() => {
    const onMove = (event) => {
      if (!drag.current) return;
      setDragWidth(clampMapWidth(drag.current.width + (drag.current.x - event.clientX), rowWidth));
    };
    const onUp = (event) => {
      if (!drag.current) return;
      const next = clampMapWidth(drag.current.width + (drag.current.x - event.clientX), rowWidth);
      drag.current = null;
      document.body.style.userSelect = "";
      setDragWidth(null);
      sp.setWidth(next);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  return (
    <div ref={rowRef} className="sc-sp-beside" style={{ display: "flex", alignItems: "flex-start", width: "100%" }} data-testid="spatial-beside">
      <div style={{ flex: "1 1 0", minWidth: 0 }}>{heatmap}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize the tissue map (double-click to reset)"
        data-testid="spatial-splitter"
        style={{ flex: `0 0 ${SPLITTER_WIDTH}px`, alignSelf: "stretch", cursor: "col-resize", display: "flex", justifyContent: "center" }}
        onMouseDown={(event) => {
          drag.current = { x: event.clientX, width };
          document.body.style.userSelect = "none";
          event.preventDefault();
        }}
        onDoubleClick={() => sp.setWidth(480)}
      >
        <div style={{ width: 2, margin: "0 auto", background: "rgba(128,128,128,0.35)", borderRadius: 1 }} />
      </div>
      <div
        className="sc-sp-map-col"
        style={{
          flex: `0 0 ${width}px`,
          width,
          position: "sticky",
          top: "calc(var(--sc-sticky-top, 144px) + 6px)",
          maxHeight: "calc(100vh - var(--sc-sticky-top, 144px) - 12px)",
          overflowY: "auto",
        }}
      >
        {map}
      </div>
    </div>
  );
}

/** Toggles row for slide-tag patients: layout, map size, compact view and the list of collapsible sections. */
export function SpatialToolbar() {
  const sp = useSpatialLayout();
  if (!sp.active) return null;
  const nHidden = sp.hidden.length;
  return (
    <Space wrap size={[16, 4]} data-testid="spatial-toolbar">
      <Space size={6}>
        <Typography.Text type="secondary">Tissue map</Typography.Text>
        <Segmented
          size="small"
          value={sp.mode}
          onChange={sp.setMode}
          options={[
            { value: "beside", label: "Beside", disabled: sp.viewport < 1200 },
            { value: "below", label: "Below" },
          ]}
        />
        {sp.mode === "beside" && (
          <Segmented
            size="small"
            value={presetOf(sp.width) || undefined}
            onChange={(k) => sp.setWidth(SIZE_PRESETS[k])}
            options={Object.keys(SIZE_PRESETS)}
          />
        )}
      </Space>
      <Space size={6}>
        <Switch size="small" checked={sp.compact} onChange={sp.setCompact} data-testid="spatial-compact" />
        <Typography.Text>Compact spatial view</Typography.Text>
      </Space>
      <Dropdown
        trigger={["click"]}
        dropdownRender={() => (
          <div style={{ background: "var(--ant-color-bg-elevated, #fff)", padding: 8, borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,.2)", display: "flex", flexDirection: "column" }}>
            {SPATIAL_SECTIONS.map((k) => (
              <Checkbox key={k} checked={!sp.hidden.includes(k)} onChange={() => sp.toggle(k)}>
                {sectionTitle(k)}
              </Checkbox>
            ))}
          </div>
        )}
      >
        <Button type="link" size="small" style={{ padding: 0 }} data-testid="spatial-sections">{`Sections (${nHidden} hidden)`}</Button>
      </Dropdown>
    </Space>
  );
}
