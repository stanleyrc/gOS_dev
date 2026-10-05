import React, { useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Affix, Alert, Col, Empty, Progress, Row, Space, Typography } from "antd";
import CellHeatmapPanel from "../../components/singleCell/cellHeatmapPanel";
import UmapPanel from "../../components/singleCell/umapPanel";
import CellSelectionPanel from "../../components/singleCell/cellSelectionPanel";
import CellTracksPanel from "../../components/singleCell/cellTracksPanel";
import CompareGroupsPanel from "../../components/singleCell/compareGroupsPanel";
import AnalysisResultsPanel from "../../components/singleCell/analysisResultsPanel";
import TracksLegendPanel from "../../components/tracksLegendPanel";
import Wrapper from "./index.style";

const { Text } = Typography;

/** Patient-level single-cell view: phylogeny, heatmaps, cell selection and per-cell tracks. */
export default function SingleCellTab() {
  const { t } = useTranslation("common");
  const { loading, loadingPercentage, error, missing, cells } = useSelector(
    (state) => state.SingleCell
  );
  const chromoBins = useSelector((state) => state.Settings.chromoBins);
  const genes = useSelector((state) => state.Genes);
  const [yScaleMode, setYScaleMode] = useState("common");

  if (loading) {
    return (
      <Wrapper>
        <Space direction="vertical" align="center" className="sc-tab-loading">
          <Progress type="circle" percent={loadingPercentage} size={72} />
          <Text type="secondary">{t("components.single-cell.loading")}</Text>
        </Space>
      </Wrapper>
    );
  }
  if (error) {
    return (
      <Wrapper>
        <Alert
          type="error"
          showIcon
          message={t("components.single-cell.errors.load")}
          description={error.message}
        />
      </Wrapper>
    );
  }
  if (missing) return null;
  if (!cells.length) {
    return (
      <Wrapper>
        <Empty description={t("components.single-cell.no-cells")} />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          {/* Same navigation as the Genome View: chromosome brush strip for one or
              more side-by-side regions, location box and gene search. It drives
              the heatmap and every cell track below. */}
          <Affix offsetTop={144}>
            <TracksLegendPanel
              {...{
                loading: genes.loading,
                genesList: genes.list,
                error: genes.error,
                chromoBins,
                visible: true,
                height: 160,
                handleYscaleModeChange: setYScaleMode,
                yScaleMode,
              }}
            />
          </Affix>
        </Col>
        <Col span={24}>
          <CellHeatmapPanel />
        </Col>
        <Col span={24}>
          <UmapPanel />
        </Col>
        <Col span={24}>
          <CellSelectionPanel />
        </Col>
        <Col span={24}>
          <CompareGroupsPanel />
        </Col>
        <Col span={24}>
          <AnalysisResultsPanel />
        </Col>
        <Col span={24}>
          <CellTracksPanel yScaleMode={yScaleMode} />
        </Col>
      </Row>
    </Wrapper>
  );
}
