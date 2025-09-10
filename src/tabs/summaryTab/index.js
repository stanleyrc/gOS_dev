import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import {
  Row,
  Col,
  Skeleton,
  Collapse,
  Space,
  Typography,
  Descriptions,
  Card,
} from "antd";
import { chunks } from "../../helpers/utility";
import { FaInfoCircle } from "react-icons/fa";
import { generateCascaderOptions } from "../../helpers/filters";
import Wrapper from "./index.style";
import ViolinPlotPanel from "../../components/violinPlotPanel";
import FilteredEventsListPanel from "../../components/filteredEventsListPanel";
import HighlightsPanel from "../../components/highlightsPanel";

class SummaryTab extends Component {
  render() {
    const { t, loading, metadata, plots, tumorPlots } = this.props;
    const { tags } = metadata;

    let plotsList = chunks(plots.filter((d) => !isNaN(metadata[d.id])));
    let tumorPlotsList = chunks(
      tumorPlots.filter((d) => !isNaN(metadata[d.id]))
    );
    let tagsList = generateCascaderOptions(tags);
    return (
      <Wrapper>
        <Skeleton active loading={loading}>
          <HighlightsPanel title={t("components.highlights-panel.title")} />
          <br />
          {tagsList.length > 0 && (
            <Card
              size="small"
              title={
                <Space>
                  <span role="img" className="anticon anticon-dashboard">
                    <FaInfoCircle />
                  </span>
                  <span className="ant-pro-menu-item-title">
                    {t("components.metadata-panel.header")}
                  </span>
                </Space>
              }
            >
              <Descriptions
                className="metadata-descriptions"
                bordered
                items={tagsList.map((tag, i) => ({
                  key: tag.value,
                  label: tag.label,
                  children: tag.children.map((child, idx) => (
                    <span key={idx}>
                      {child.label}
                      {idx < tag.children.length - 1 ? ", " : ""}
                    </span>
                  )),
                }))}
              />
            </Card>
          )}
          <Collapse
            ghost
            items={[
              {
                key: 1,
                label: (
                  <Space>{t("components.violin-panel.header.common")}</Space>
                ),
                children: plotsList.map((d, i) => (
                  <Row
                    key={i}
                    id={`row-${i}}`}
                    className="ant-panel-container ant-home-plot-container"
                    gutter={16}
                  >
                    <Col className="gutter-row" span={12}>
                      <ViolinPlotPanel
                        {...{
                          title: t("components.violin-panel.header.total"),
                          plots: plotsList[i],
                          markers: metadata,
                        }}
                      />
                    </Col>
                    <Col className="gutter-row" span={12}>
                      <ViolinPlotPanel
                        {...{
                          title: t("components.violin-panel.header.tumor", {
                            tumor: metadata.tumor,
                          }),
                          plots: tumorPlotsList[i],
                          markers: metadata,
                        }}
                      />
                    </Col>
                  </Row>
                )),
              },
            ]}
          />
        </Skeleton>
        <FilteredEventsListPanel />
      </Wrapper>
    );
  }
}
SummaryTab.propTypes = {};
SummaryTab.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  loading: state.PopulationStatistics.loading,
  metadata: state.CaseReport.metadata,
  plots: state.PopulationStatistics.general,
  tumorPlots: state.PopulationStatistics.tumor,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(SummaryTab));
