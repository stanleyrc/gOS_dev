import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Col, Progress, Row, Space, Typography } from "antd";
import CellHeatmapPanel from "../cellHeatmapPanel";
import CellTracksPanel from "../cellTracksPanel";
import TracksLegendPanel from "../../tracksLegendPanel";
import { SC_GUTTER } from "../density";
import TabWrapper from "../../../tabs/singleCellTab/index.style";
import { usePatientLoaded } from "../figures/patientFigure";
import settingsActions from "../../../redux/settings/actions";
import singleCellActions from "../../../redux/singleCell/actions";
import genesActions from "../../../redux/genes/actions";

const { Text } = Typography;

/**
 * A paper-figure panel as the patient's own Single-Cell view (the same components as the patient's Single-Cell tab,
 * not a copy): the genome navigator (chromosome brush, gene search, Collapsed / Squished / Expanded gene track) over
 * the phylogeny & heatmap (copy number, SNVs beside, zoom / pan, hover, cell selection) and the selected cells'
 * tracks. start: liveStart() output — the store windows and example cells the panel was printed with.
 */
export default function PatientLiveView({ start }) {
  const dispatch = useDispatch();
  const { patient, domains, cells } = start;
  const { ready, pct } = usePatientLoaded(patient);
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const genes = useSelector((s) => s.Genes);
  const layout = useSelector((s) => s.SingleCell.layout);
  const plotInsets = useSelector((s) => s.SingleCell.plotInsets);
  const [yScaleMode, setYScaleMode] = useState("cell");
  // the gene annotation is fetched with a report; the cohort page has none, so fetch it here once
  useEffect(() => {
    if (dataset && !genes.loadingGenesData && (!genes.data || genes.reference !== dataset.reference)) dispatch({ type: genesActions.FETCH_GENES_DATA_REQUEST });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.reference]);
  // once the patient is in the store: the printed windows, the copy-number heatmap and the panel's example cells
  const applied = useRef(null);
  const key = `${patient}|${JSON.stringify(domains)}|${cells.join(",")}`;
  useEffect(() => {
    if (!ready || applied.current === key) return;
    applied.current = key;
    if (domains.length) dispatch(settingsActions.updateDomains(domains));
    dispatch(singleCellActions.updateHeatmapType("cn"));
    dispatch(singleCellActions.updateSelection(cells));
  }, [ready, key, domains, cells, dispatch]);
  if (!ready) {
    return (
      <Space direction="vertical" align="center" style={{ width: "100%", padding: 32 }}>
        <Progress type="circle" percent={pct || 0} size={64} />
        <Text type="secondary">{`Loading ${patient}…`}</Text>
      </Space>
    );
  }
  return (
    <TabWrapper className="sc-paperlive-body" style={{ "--sc-sticky-top": "0px" }}>
      <TracksLegendPanel
        {...{
          loading: genes.loading,
          genesList: genes.list,
          error: genes.error,
          chromoBins,
          visible: true,
          handleYscaleModeChange: setYScaleMode,
          cellYscaleOption: true,
          yScaleMode,
          compact: false,
          plotInsets,
          plotHeight: layout.navHeight,
          compactKeepsGenes: true,
        }}
      />
      <Row gutter={SC_GUTTER}>
        <Col span={24}>
          <CellHeatmapPanel />
        </Col>
        <Col span={24}>
          <CellTracksPanel yScaleMode={yScaleMode} />
        </Col>
      </Row>
    </TabWrapper>
  );
}
