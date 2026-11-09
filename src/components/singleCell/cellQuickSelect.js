import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Input, Select, Space, Typography } from "antd";
import singleCellActions from "../../redux/singleCell/actions";
import { namedCladeByCell } from "../../helpers/singleCell/cellCladeEcdnaFields";
import {
  QC_OPTIONS,
  TN_OPTIONS,
  buildCellFacts,
  emptyCriteria,
  filterOptions,
  hasCriteria,
  matchingCellIds,
  unmatchedTerms,
} from "../../helpers/singleCell/cellSearch";
import usePatientClades from "./usePatientClades";
import useCellLabels from "./useCellLabels";

const { Text } = Typography;
const pick = (placeholder, options, value, onChange, width = 130) => (
  <Select
    mode="multiple"
    size="small"
    allowClear
    maxTagCount="responsive"
    placeholder={placeholder}
    style={{ minWidth: width }}
    options={options}
    value={value}
    onChange={onChange}
  />
);

/**
 * Quick cell selection above the single-cell page controls: a name box (substring of the cell id or well, several
 * names separated by commas / spaces / new lines, paste a list) and QC filters. The matching cells become the shared
 * selection (SingleCell.selectedCellIds), so every view that highlights the selection follows it.
 */
export default function CellQuickSelect() {
  const dispatch = useDispatch();
  const cells = useSelector((s) => s.SingleCell.cells);
  const selected = useSelector((s) => s.SingleCell.selectedCellIds);
  const qcDoc = useSelector((s) => s.SingleCell.precompute?.qc);
  const rna = useSelector((s) => s.SingleCell.rna);
  const clades = usePatientClades();
  const labels = useCellLabels();
  const [criteria, setCriteria] = useState(emptyCriteria);

  const facts = useMemo(() => {
    const stateByCell = new Map();
    if (rna?.status === "ok") (rna.data?.cells || []).forEach((c) => c.cell_id && c.state && stateByCell.set(`${c.cell_id}`, `${c.state}`));
    return buildCellFacts({
      cells,
      qcRows: qcDoc?.status === "ok" ? qcDoc.data?.cells : [],
      cladeByCell: clades.status === "ok" ? namedCladeByCell(clades.data?.named_groups) : new Map(),
      stateByCell,
    });
  }, [cells, qcDoc, rna, clades]);
  const options = useMemo(() => filterOptions(facts), [facts]);
  const noQc = !(qcDoc?.status === "ok") && !cells.some((c) => c["QC flag"] != null || c.QC != null);

  const apply = (next) => {
    setCriteria(next);
    dispatch(singleCellActions.updateSelection(matchingCellIds(facts, next, labels.map)));
  };
  const set = (key) => (value) => apply({ ...criteria, [key]: value });
  const clear = () => {
    setCriteria(emptyCriteria());
    dispatch(singleCellActions.updateSelection([]));
  };
  const missing = useMemo(() => unmatchedTerms(facts, criteria.text, labels.map), [facts, criteria.text, labels.map]);
  const strOpts = (list) => list.map((v) => ({ value: v, label: v }));
  const active = hasCriteria(criteria);

  return (
    <Space wrap size={[8, 4]} className="sc-quick-select" style={{ marginBottom: 4 }} data-testid="sc-quick-select">
      <Text strong>Quick select</Text>
      <Input.TextArea
        size="small"
        allowClear
        autoSize={{ minRows: 1, maxRows: 3 }}
        placeholder="Cell names (substring), several separated by commas or spaces; paste a list"
        style={{ width: 340 }}
        value={criteria.text}
        onChange={(e) => apply({ ...criteria, text: e.target.value })}
      />
      {pick("Tumor / normal", TN_OPTIONS, criteria.tn, set("tn"), 120)}
      {pick(noQc ? "QC (not available)" : "QC", QC_OPTIONS, criteria.qc, set("qc"), 120)}
      {options.clades.length ? pick("Clade", strOpts(options.clades), criteria.clades, set("clades"), 100) : null}
      {options.states.length ? pick("Cell state", strOpts(options.states), criteria.states, set("states"), 110) : null}
      {options.clones.length > 1 ? pick("Clone", strOpts(options.clones), criteria.clones, set("clones"), 100) : null}
      <Text data-testid="sc-quick-count">{`${selected.length} of ${cells.length} cells selected`}</Text>
      <Button size="small" onClick={clear} disabled={!active && !selected.length}>
        Clear
      </Button>
      {criteria.text && missing.length ? <Text type="secondary">{`no cell matches: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5})` : ""}`}</Text> : null}
      {active && !matchingCellIds(facts, criteria, labels.map).length ? <Text type="secondary">no cell matches these filters</Text> : null}
    </Space>
  );
}
