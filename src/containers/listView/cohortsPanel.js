import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import * as d3 from "d3";
import { Row, Col, Divider, Skeleton, Card, Empty } from "antd";
import HistogramPlotPanel from "../../components/histogramPlotPanel";
import Wrapper from "./index.style";

class CohortsPanel extends Component {
  render() {
    const { t, loading, plots } = this.props;

    let plotGroups = d3.groups(
      plots.filter((d) => d.data && d.data.length > 0),
      (d) => d.group
    );

    let plotTuples = plotGroups.map(([group, groupPlots]) => {
      let groupTitle = groupPlots[0]?.groupTitle || group;
      let plotRows = groupPlots
        .sort((a, b) => d3.ascending(a.order, b.order))
        .map((d, index) => {
          let plotComponent = (
            <HistogramPlotPanel
              {...{
                id: d.id,
                data: d.data,
                dataset: d.dataset,
                q1: d.q1,
                q3: d.q3,
                q99: d.q99,
                scaleX: d.scaleX,
                range: d.range,
                bandwidth: d.bandwidth,
                title: d.title,
                group: d.group,
                groupTitle: d.groupTitle,
                order: d.order,
                visible: d.data,
                format: d.format,
                loading,
              }}
            />
          );

          return plotComponent;
        });

      let tuples = Array.from(
        { length: Math.ceil(plotRows.length / 3) },
        (_, i) => plotRows.slice(i * 3, i * 3 + 3)
      );
      return { groupTitle, tuples };
    });

    return (
      <Wrapper>
        <Skeleton active loading={loading}>
          {plotGroups.length > 0 ? (
            plotTuples.map(({ groupTitle, tuples }, groupIndex) => (
              <div key={groupIndex} className="population-plot-group">
                <Divider plain orientation="left">
                  {groupTitle}
                </Divider>
                {tuples.map((pair, index) => (
                  <Row
                    key={index}
                    id={`row-${groupIndex}-${index}`}
                    className="ant-panel-container ant-home-plot-container"
                    gutter={16}
                  >
                    {pair.map((plotComponent, i) => (
                      <Col
                        key={i}
                        className="gutter-row"
                        span={Math.floor(24 / pair.length)}
                      >
                        {plotComponent}
                      </Col>
                    ))}
                  </Row>
                ))}
              </div>
            ))
          ) : (
            <Card>
              <Empty description={t("containers.list-view.no_data")} />
            </Card>
          )}
        </Skeleton>
      </Wrapper>
    );
  }
}

CohortsPanel.propTypes = {};
CohortsPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  plots: state.PopulationStatistics.cohort,
  loading: state.PopulationStatistics.cohortsLoading,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(CohortsPanel));
