import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col } from "antd";
import HistogramPlotPanel from "../histogramPlotPanel";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const {} = appActions;

class PopulationPanel extends Component {
  render() {
    const { t, loading, plots, visible, scope } = this.props;

    if (!visible) return null;

    let plotRows = plots
      .filter((d) => !isNaN(d.markValue))
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
              title: t(`metadata.${d.id}.full`, { ns: scope }),
              visible: d.data,
              markValue: d.markValue,
              markValueText: d.markValueText,
              colorMarker: d.colorMarker,
              format: d.format,
              loading,
            }}
          />
        );

        return plotComponent;
      });

    const tuples = Array.from(
      { length: Math.ceil(plotRows.length / 3) },
      (_, i) => plotRows.slice(i * 3, i * 3 + 3)
    );

    return (
      <Wrapper>
        {tuples.map((pair, index) => (
          <Row
            key={index}
            id={`row-${index}}`}
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
