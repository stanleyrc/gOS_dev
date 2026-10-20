import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Select, Typography } from "antd";
import usePatientClades from "../usePatientClades";
import { cladePloidyRows } from "../../../helpers/singleCell/cnFit";
import settingsActions from "../../../redux/settings/actions";
import singleCellActions from "../../../redux/singleCell/actions";
import { SINGLE_CELL_PPFIT_TAB_KEY } from "../../../helpers/detailTabAvailability";

const { Text } = Typography;

/** Small link from the Single-Cell tab to the purity / ploidy fit tab, on the selected cells when there are any. */
export default function PpfitLink() {
  const dispatch = useDispatch();
  const selected = useSelector((s) => s.SingleCell.selectedCellIds) || [];
  const cells = useSelector((s) => s.SingleCell.cells);
  const clades = usePatientClades();
  const rows = useMemo(() => (clades.status === "ok" ? cladePloidyRows(clades.data.clades, cells) : []), [clades, cells]);
  const open = (focus = selected.length ? "sel" : null) => {
    dispatch(singleCellActions.updateLayout({ ppfitFocus: focus }));
    dispatch(settingsActions.updateTab(SINGLE_CELL_PPFIT_TAB_KEY));
  };
  return (
    <div style={{ padding: "0 4px" }}>
      <Button type="link" size="small" onClick={() => open()} style={{ paddingLeft: 0 }}>Purity/ploidy fit</Button>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {selected.length ? `opens the fit of the ${selected.length} selected cells` : "opens the fit tab (pick a cell or clade there, or select cells in the heatmap first)"}
      </Text>
      {rows.length > 0 && (
        <Select
          size="small"
          style={{ minWidth: 220, marginLeft: 12 }}
          placeholder="or fit a clade"
          value={null}
          onChange={(v) => open(v)}
          options={rows.map((r) => ({ value: `clade:${r.id}`, label: `${r.id} (n=${r.cells.length})` }))}
        />
      )}
    </div>
  );
}
