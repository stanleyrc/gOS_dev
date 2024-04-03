import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import handleViewport from "react-in-viewport";
import { Row, Col, Modal } from "antd";
import { withTranslation } from "react-i18next";
import GenomePanel from "../genomePanel";
import { transitionStyle } from "../../helpers/utility";
import Wrapper from "./index.style";
import ScatterPlotPanel from "../scatterPlotPanel";
import GenesPanel from "../genesPanel";
import appActions from "../../redux/app/actions";

const { updateDomains, updateHoveredLocation } = appActions;

class TracksModal extends Component {
  render() {
    const {
      loading,
      genomeData,
      mutationsData,
      coverageData,
      hetsnpsData,
      coverageYAxisTitle,
      coverageYAxis2Title,
      metadata,
      genesData,
      allelicData,
      inViewport,
      renderOutsideViewPort,
      chromoBins,
      modalTitle,
      genomePlotTitle,
      genomePlotYAxisTitle,
      mutationsPlotTitle,
      mutationsPlotYAxisTitle,
      coveragePlotTitle,
      hetsnpPlotTitle,
      hetsnpPlotYAxisTitle,
      allelicPlotTitle,
      allelicPlotYAxisTitle,
      handleOkClicked,
      handleCancelClicked,
      width,
      height,
      open,
    } = this.props;
    if (!open) return null;
    const { beta, gamma } = metadata;
    return (
      <Wrapper visible={open}>
        <Modal
          title={modalTitle}
          centered
          open={open}
          onOk={handleOkClicked}
          onCancel={handleCancelClicked}
          width={width}
          footer={null}
          forceRender={true}
        >
          <Row
            style={transitionStyle(inViewport || renderOutsideViewPort)}
            className="ant-panel-container ant-home-plot-container"
            gutter={16}
          >
            <Col className="gutter-row" span={24}>
              <GenesPanel
                {...{
                  genes: genesData,
                  chromoBins,
                  visible: true,
                  height,
                }}
              />
            </Col>
            <Col className="gutter-row" span={24}>
              <GenomePanel
                {...{
                  loading,
                  genome: genomeData,
                  title: genomePlotTitle,
                  yAxisTitle: genomePlotYAxisTitle,
                  chromoBins,
                  visible: true,
                  index: 0,
                  height,
                }}
              />
            </Col>
            <Col className="gutter-row" span={24}>
              <ScatterPlotPanel
                {...{
                  data: coverageData,
                  title: coveragePlotTitle,
                  scaleY2: { show: true, slope: beta, intercept: -gamma },
                  chromoBins,
                  visible: true,
                  loading,
                  height,
                  yAxisTitle: coverageYAxisTitle,
                  yAxis2Title: coverageYAxis2Title,
                }}
              />
            </Col>
            <Col className="gutter-row" span={24}>
              <ScatterPlotPanel
                {...{
                  data: hetsnpsData,
                  title: hetsnpPlotTitle,
                  chromoBins,
                  visible: true,
                  loading,
                  height,
                  yAxisTitle: hetsnpPlotYAxisTitle,
                }}
              />
            </Col>
            {allelicData && (
              <Col className="gutter-row" span={24}>
                <GenomePanel
                  {...{
                    loading,
                    genome: allelicData,
                    title: allelicPlotTitle,
                    yAxisTitle: allelicPlotYAxisTitle,
                    chromoBins,
                    visible: true,
                    index: 0,
                    height,
                  }}
                />
              </Col>
            )}
            {mutationsData && (
              <Col className="gutter-row" span={24}>
                <GenomePanel
                  {...{
                    loading,
                    genome: mutationsData,
                    title: mutationsPlotTitle,
                    yAxisTitle: mutationsPlotYAxisTitle,
                    chromoBins,
                    visible: true,
                    index: 0,
                    height,
                    mutationsPlot: true,
                  }}
                />
              </Col>
            )}
          </Row>
        </Modal>
      </Wrapper>
    );
  }
}
TracksModal.propTypes = {
  data: PropTypes.array,
};
TracksModal.defaultProps = {
  genomeData: { intervals: [], connections: [] },
  width: 1200,
  height: 180,
};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
  updateHoveredLocation: (hoveredLocation, panelIndex) =>
    dispatch(updateHoveredLocation(hoveredLocation, panelIndex)),
});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.App.renderOutsideViewPort,
  domains: state.App.domains,
  metadata: state.App.metadata,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(TracksModal, { rootMargin: "-1.0px" })
  )
);
