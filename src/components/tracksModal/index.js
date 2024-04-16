import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import handleViewport from "react-in-viewport";
import { Row, Col, Modal, message, Tooltip, Space, Button } from "antd";
import { withTranslation } from "react-i18next";
import GenomePanel from "../genomePanel";
import { AiOutlineDownload } from "react-icons/ai";
import * as htmlToImage from "html-to-image";
import { transitionStyle, downloadCanvasAsPng } from "../../helpers/utility";
import Wrapper from "./index.style";
import ScatterPlotPanel from "../scatterPlotPanel";
import GenesPanel from "../genesPanel";
import appActions from "../../redux/app/actions";

const { updateDomains, updateHoveredLocation } = appActions;

class TracksModal extends Component {
  container = null;

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.modalTitleText.replace(/\s+/g, "_").toLowerCase()}.png`
        );
      })
      .catch((error) => {
        message.error(this.props.t("general.error", { error }));
      });
  };

  render() {
    const {
      t,
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
      viewType,
    } = this.props;
    if (!open) return null;
    const { beta, gamma } = metadata;
    let content = (
      <Row
        style={transitionStyle(inViewport || renderOutsideViewPort)}
        className="ant-panel-container ant-home-plot-container"
        gutter={[16, 24]}
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
    );
    return (
      <Wrapper visible={open}>
        {viewType === "modal" ? (
          <Modal
            title={
              <Space>
                {modalTitle}
                <Button
                  type="default"
                  shape="circle"
                  icon={<AiOutlineDownload />}
                  size="small"
                  onClick={() => this.onDownloadButtonClicked()}
                />
              </Space>
            }
            centered
            open={open}
            onOk={handleOkClicked}
            onCancel={handleCancelClicked}
            width={width}
            footer={null}
            forceRender={true}
          >
            <div ref={(elem) => (this.container = elem)}>{content}</div>
          </Modal>
        ) : (
          <div style={{ height: `${height}px; width: ${width}px` }}>
            {content}
          </div>
        )}
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
  viewType: "modal",
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
