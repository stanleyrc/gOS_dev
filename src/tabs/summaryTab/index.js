import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import {
  Row,
  Col,
  Skeleton,
  Collapse,
  Space,
  Descriptions,
  Card,
  Divider,
  Typography,
  Flex,
} from "antd";
import { chunks } from "../../helpers/utility";
import { FaInfoCircle } from "react-icons/fa";
import { generateCascaderOptions } from "../../helpers/filters";
import Wrapper from "./index.style";
import ViolinPlotPanel from "../../components/violinPlotPanel";
import FilteredEventsListPanel from "../../components/filteredEventsListPanel";
import HighlightsPanel from "../../components/highlightsPanel";
import * as d3 from "d3";

const { Text } = Typography;

class SummaryTab extends Component {
  // Helper function to process plot groups
  processPlotGroups = (plots, metadata) => {
    const filteredPlots = plots.filter((d) => !isNaN(metadata[d.id]));
    const groups = d3.groups(filteredPlots, (d) => d.group);

    return groups.map(([group, groupPlots]) => {
      const groupTitle = groupPlots[0]?.groupTitle || group;
      const sortedPlots = groupPlots.sort((a, b) =>
        d3.ascending(a.order, b.order)
      );
      const plotsList = chunks(sortedPlots);
      return { group, plotsList, groupTitle };
    });
  };

  // Helper function to render violin plot panel
  renderViolinPlotPanel = (plots, title, metadata) => (
    <ViolinPlotPanel
      {...{
        title: <span dangerouslySetInnerHTML={{ __html: title }} />,
        plots,
        markers: metadata,
      }}
    />
  );

  render() {
    const {
      t,
      loading,
      metadata,
      plots,
      tumorPlots,
      highlightsMissing,
      dataset,
    } = this.props;

    const plotGroups = this.processPlotGroups(plots, metadata);
    const tumorPlotGroups = this.processPlotGroups(tumorPlots, metadata);

    let fields = dataset.fields.map((field) => {
      let tagslist = field.isPair
        ? generateCascaderOptions(metadata[field.id])
        : [];
      return {
        key: field.id,
        label: field.title,
        children:
          metadata[field.id] == null ? (
            <Text type="secondary">{t("general.not-applicable")}</Text>
          ) : field.isNumeric ? (
            d3.format(field.format)(metadata[field.id])
          ) : field.isPair ? (
            tagslist.length > 0 ? (
              <Space direction="vertical" size={0} style={{ display: "flex" }}>
                {tagslist.map((tag, i) => (
                  <div key={`tag-${tag.value}-${i}`}>
                    <Divider plain orientation="left" size="small">
                      {tag.label}
                    </Divider>
                    <Flex gap="2px" wrap="wrap">
                      {tag.children.map((child) => (
                        <Text key={child.value} code>
                          {child.label}
                        </Text>
                      ))}
                    </Flex>
                  </div>
                ))}
              </Space>
            ) : (
              <Text type="secondary">{t("general.not-applicable")}</Text>
            )
          ) : (
            <Text>{metadata[field.id]}</Text>
          ),
      };
    });

    return (
      <Wrapper>
        <Skeleton active loading={loading}>
          {!highlightsMissing && (
            <>
              <HighlightsPanel title={t("components.highlights-panel.title")} />
              <br />
            </>
          )}
          <Collapse
            ghost
            items={[
              {
                key: 0,
                label: <Space>{t("components.metadata-panel.header")}</Space>,
                children: (
                  <Card
                    size="small"
                    title={
                      <Space>
                        <span role="img" className="anticon anticon-dashboard">
                          <FaInfoCircle />
                        </span>
                        <span className="ant-pro-menu-item-title">
                          {t("components.metadata-panel.title")}
                        </span>
                      </Space>
                    }
                  >
                    <Descriptions
                      className="metadata-descriptions"
                      bordered
                      items={fields}
                    />
                  </Card>
                ),
              },
              {
                key: 1,
                label: (
                  <Space>{t("components.violin-panel.header.common")}</Space>
                ),
                children: plotGroups.map(({ groupTitle, plotsList }, j) =>
                  plotsList.map((d, i) => (
                    <Row
                      key={i}
                      id={`row-${i}}`}
                      className="ant-panel-container ant-home-plot-container"
                      gutter={16}
                    >
                      <Col className="gutter-row" span={12}>
                        {this.renderViolinPlotPanel(
                          plotsList[i],
                          t("components.violin-panel.header.total", {
                            scope: groupTitle,
                          }),
                          metadata
                        )}
                      </Col>
                      <Col className="gutter-row" span={12}>
                        {this.renderViolinPlotPanel(
                          tumorPlotGroups[j].plotsList[i],
                          t("components.violin-panel.header.tumor", {
                            tumor: metadata.tumor,
                            scope: groupTitle,
                          }),
                          metadata
                        )}
                      </Col>
                    </Row>
                  ))
                ),
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
  highlightsMissing: state.Highlights.highlightsMissing,
  metadata: state.CaseReport.metadata,
  plots: state.PopulationStatistics.general,
  tumorPlots: state.PopulationStatistics.tumor,
  dataset: state.Settings.dataset,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(SummaryTab));
