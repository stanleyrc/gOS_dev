import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Tag, message } from "antd";
import { SC_DEFAULT_LAYOUT, SC_LAYOUT_STORAGE_KEY, SC_PALETTE_STORAGE_KEY } from "../../redux/singleCell/actions";
import { savedLayoutDiffers, resetSavedView, takeDroppedNotice, savingEnabled } from "../../helpers/singleCell/viewSettingsStore";

/** Every per-user saved display key that "Reset to defaults" clears (never the switch, notes or searches). */
export const SAVED_VIEW_KEYS = [
  SC_LAYOUT_STORAGE_KEY,
  SC_PALETTE_STORAGE_KEY,
  "sc.umap.exprScale",
  "sc.umap.hideZero",
  "gos-cohort-events-columns",
  "gos.filteredEventsColumnLayout.v1",
];

/** "Saved view - Reset to defaults": shown only when saved settings are in effect and differ from the defaults. */
export default function SavedViewChip() {
  const layout = useSelector((state) => state.SingleCell.layout); // re-evaluate when the layout changes
  const [differs, setDiffers] = useState([]);
  useEffect(() => {
    setDiffers(savingEnabled() ? savedLayoutDiffers(SC_LAYOUT_STORAGE_KEY, SC_DEFAULT_LAYOUT) : []);
  }, [layout]);
  useEffect(() => {
    if (takeDroppedNotice()) {
      message.info("Your saved view settings were from an older version of gOS and were reset to the new defaults.", 8);
    }
  }, []);
  if (!differs.length) return null;
  return (
    <Tag color="gold" data-testid="saved-view-chip" style={{ margin: 0 }}>
      Saved view ({differs.length} setting{differs.length === 1 ? "" : "s"} differ from defaults) {"· "}
      <Button
        type="link"
        size="small"
        style={{ padding: 0, height: "auto" }}
        onClick={() => {
          resetSavedView(SAVED_VIEW_KEYS);
          window.location.reload();
        }}
      >
        Reset to defaults
      </Button>
    </Tag>
  );
}
