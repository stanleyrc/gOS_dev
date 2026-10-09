import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Col, Empty, Progress, Row, Space, Typography } from "antd";
import CellHeatmapPanel from "../cellHeatmapPanel";
import useWalks from "../ecdna/useWalks";
import WalkContainmentCard from "../ecdna/walkContainmentCard";
import WalkTreeBars from "../ecdna/walkTreeBars";
import WalkCooccurrence from "../ecdna/walkCooccurrence";
import WalkDiagram from "../ecdna/walkDiagram";
import useTreeView from "../useTreeView";
import singleCellActions from "../../../redux/singleCell/actions";
import settingsActions from "../../../redux/settings/actions";
import { walkFamilies } from "../../../helpers/singleCell/walks";
import { defaultFocusWalk } from "../../../helpers/singleCell/walkPanels";
import { SC_GUTTER } from "../density";

const { Text } = Typography;

/**
 * The patient report's own ecDNA panels (phylogeny & heatmap, walk copies
 * along the tree, how the walks nest, the walk ring, co-occurrence and walk
 * vs walk copies) for a patient picked in the cohort figures: loads that
 * patient into the single-cell store, zooms the heatmap to `domains` and
 * selects the `marked` cells, so the figure is the live, interactive view.
 */
export default function PatientEcdnaView({ patient, domains, walkIds, marked }) {
  const dispatch = useDispatch();
  const loaded = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const loading = useSelector((s) => s.SingleCell.loading);
  const missing = useSelector((s) => s.SingleCell.missing);
  const error = useSelector((s) => s.SingleCell.error);
  const pct = useSelector((s) => s.SingleCell.loadingPercentage);
  const cellsAll = useSelector((s) => s.SingleCell.cells);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const ready = !!patient && `${loaded}` === `${patient}`;

  const [requested, setRequested] = useState(null);
  useEffect(() => {
    if (!patient || ready || requested === patient) return;
    setRequested(patient);
    dispatch(singleCellActions.fetchSingleCellData(patient));
  }, [patient, ready, requested, dispatch]);

  const domainsKey = JSON.stringify(domains || []);
  useEffect(() => {
    if (ready && chromoBins && domains?.length) dispatch(settingsActions.updateDomains(domains));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, domainsKey, chromoBins, dispatch]);

  const markedKey = marked ? `${marked.key}:${marked.cells.size}` : "";
  useEffect(() => {
    if (ready) dispatch(singleCellActions.updateSelection(marked ? [...marked.cells] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markedKey, dispatch]);

  const { order } = useTreeView();
  const cellIds = useMemo(() => (order.length ? order : cellsAll.map((c) => c.cell_id)), [order, cellsAll]);
  const { status, all, measured, filters, colorOf, byId } = useWalks(cellIds);
  const shown = useMemo(() => {
    const picked = (walkIds || []).map((id) => byId.get(`${id}`)).filter(Boolean);
    if (picked.length) return picked;
    const fams = walkFamilies(all).filter((fam) => fam.some((w) => w.curated));
    return (fams.length ? fams.flat() : all.slice(0, 6)).slice(0, 24);
  }, [walkIds, byId, all]);
  const families = useMemo(() => walkFamilies(shown), [shown]);
  const [focus, setFocus] = useState(null);
  const focused = (focus && byId.get(focus)) || defaultFocusWalk(shown, cellIds);

  if (!ready) {
    if ((missing || error) && requested === patient && !loading) return <Empty description={missing ? `No single-cell data for ${patient}` : `${patient} failed to load`} />;
    return (
      <Space direction="vertical" style={{ width: "100%", padding: "24px 0" }} align="center">
        <Text type="secondary">{`Loading ${patient}…`}</Text>
        <Progress percent={loading ? pct || 0 : 0} size="small" style={{ width: 240 }} />
      </Space>
    );
  }
  return (
    <Row gutter={SC_GUTTER}>
      <Col span={24}>
        <CellHeatmapPanel />
      </Col>
      {status === "ok" && shown.length > 0 && (
        <>
          <Col span={24}>
            <WalkTreeBars walks={shown} families={families} colorOf={colorOf} measured={measured} />
          </Col>
          <Col xs={24} xl={10}>
            <WalkContainmentCard walks={shown} colorOf={colorOf} cellIds={cellIds} focus={focused?.id} onFocus={setFocus} />
          </Col>
          <Col xs={24} xl={14}>
            <WalkDiagram walk={focused} colorOf={colorOf} cellIds={cellIds} />
          </Col>
          <Col span={24}>
            <WalkCooccurrence walks={shown} families={families} cellIds={cellIds} colorOf={colorOf} minCn={filters.minCn} />
          </Col>
        </>
      )}
    </Row>
  );
}
