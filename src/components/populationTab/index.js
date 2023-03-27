import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col } from "antd";
import HistogramPlotPanel from "../../components/histogramPlotPanel";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";
import RidgelinePlotPanel from "../ridgelinePlotPanel";

const {} = appActions;

class PopulationTab extends Component {
  render() {
    const { t, loading, selectedFile, plots } = this.props;
    if (!selectedFile) return null;
    let plotRows = plots.map((d, index) => {
      let plotComponent = null;
      if (d.type === "histogram") {
        plotComponent = (
          <HistogramPlotPanel
            {...{
              data: d.data,
              mean: d.mean,
              sigma: d.sigma,
              title: t(`metadata.${d.id}.full`),
              visible: d.data,
              markValue: selectedFile.metadata[d.id],
              colorMarker: d.colorMarker,
              loading,
            }}
          />
        );
      }
      return plotComponent;
    });

    const tuples = Array.from(
      { length: Math.ceil(plotRows.length / 3) },
      (_, i) => plotRows.slice(i * 3, i * 3 + 3)
    );

    return (
      <Wrapper>
        <Row
          key={0}
          id={`row-${0}}`}
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={8}>
            {
              <RidgelinePlotPanel
                {...{
                  plots: plots.filter((d) => d.type === "histogram"),
                  markers: selectedFile.metadata,
                }}
              />
            }
          </Col>
        </Row>
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
PopulationTab.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(PopulationTab));
