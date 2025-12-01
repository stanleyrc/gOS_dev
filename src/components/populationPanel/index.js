import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import * as d3 from "d3";
import { Row, Col, Divider } from "antd";
import HistogramPlotPanel from "../histogramPlotPanel";
import { getColorMarker } from "../../helpers/utility";
import Wrapper from "./index.style";

class PopulationPanel extends Component {
  render() {
    const { loading, plots, visible } = this.props;

    if (!visible) return null;

    let plotGroups = d3.groups(
      plots.filter((d) => !isNaN(d.markValue)),
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
                data: d.data,
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
                markValue: d.markValue,
                markValueText: d3.format(d.markValueFormat)(d.markValue),
                colorMarker: getColorMarker(d.markValue, d.q1, d.q3),
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
        {plotTuples.map(({ groupTitle, tuples }, groupIndex) => (
          <div key={groupIndex} className="population-plot-group">
            <Divider plain orientation="left">
              {groupTitle}
            </Divider>
            {tuples.map((pair, index) => (
              <Row
                key={index}
                id={`row-${groupIndex}-${index}}`}
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
        ))}
      </Wrapper>
    );
  }
}
PopulationPanel.propTypes = {};
PopulationPanel.defaultProps = {
  plots: [],
  visible: true,
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation(["common", "signatures"])(PopulationPanel));
