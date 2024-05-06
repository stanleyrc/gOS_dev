import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col, Switch, Space } from "antd";
import HistogramPlotPanel from "../../components/histogramPlotPanel";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const {} = appActions;

class PopulationTab extends Component {
  state = {
    hideZeros: true,
  };

  onChange = (hideZeros) => {
    console.log(`switch to ${hideZeros}`);
    this.setState({ hideZeros });
  };

  render() {
    const { t, loading, plots } = this.props;
    const { hideZeros } = this.state;

    let plotRows = plots
      .filter((d) => !hideZeros || d.markValue > 0)
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
              title: t(`metadata.${d.id}.full`),
              visible: d.data,
              markValue: d.markValue,
              markValueText: d.markValueText,
              colorMarker: d.colorMarker,
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
        <Space>
          <Switch defaultChecked onChange={this.onChange} />{" "}
          {t("components.histogram-panel.hide-zero-values-plot")}
        </Space>
        {tuples.map((pair, index) => (
          <Row
            key={index}
            id={`row-${index}}`}
            className="ant-panel-container ant-home-plot-container"
            gutter={16}
          >
            {pair.map((plotComponent, i) => (
              <Col className="gutter-row" span={Math.floor(24 / pair.length)}>
                {plotComponent}
              </Col>
            ))}
          </Row>
        ))}
      </Wrapper>
    );
  }
}
PopulationTab.propTypes = {};
PopulationTab.defaultProps = {
  plots: [],
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(PopulationTab));
