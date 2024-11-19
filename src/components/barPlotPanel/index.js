import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import ContainerDimensions from "react-container-dimensions";
import handleViewport from "react-in-viewport";
import {
  Card,
  Space,
  Tooltip,
  Button,
  message,
  Row,
  Col,
  Segmented,
  Skeleton,
} from "antd";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import { FaRegChartBar } from "react-icons/fa";
import { downloadCanvasAsPng, transitionStyle } from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import Wrapper from "./index.style";
import BarPlot from "../barPlot";

const margins = {
  padding: 0,
  gap: 0,
};

class BarPlotPanel extends Component {
  container = null;

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.title.replace(/\s+/g, "_").toLowerCase()}.png`
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
      dataPoints,
      referenceDataPoints,
      legend,
      xTitle,
      xVariable,
      xRange,
      xFormat,
      xAxisRotation,
      yTitle,
      yVariable,
      colorVariable,
      yRange,
      yFormat,
      title,
      inViewport,
      renderOutsideViewPort,
      visible,
      segmentedOptions,
      handleSegmentedChange,
      segmentedValue,
    } = this.props;
    if (!colorVariable) {
      return null;
    }
    return (
      <Wrapper visible={visible}>
        <Skeleton active loading={loading}>
          <Card
            style={transitionStyle(inViewport || renderOutsideViewPort)}
            loading={loading}
            size="small"
            title={
              <Space>
                <span role="img" className="anticon anticon-dashboard">
                  <FaRegChartBar />
                </span>
                <span className="ant-pro-menu-item-title">{title}</span>
              </Space>
            }
            extra={
              <Space>
                <Segmented
                  options={segmentedOptions}
                  onChange={(d) => handleSegmentedChange(d)}
                  value={segmentedValue}
                />
                <Tooltip title={t("components.download-as-png-tooltip")}>
                  <Button
                    type="default"
                    shape="circle"
                    disabled={!visible}
                    icon={<AiOutlineDownload style={{ marginTop: 4 }} />}
                    size="small"
                    onClick={() => this.onDownloadButtonClicked()}
                  />
                </Tooltip>
              </Space>
            }
          >
            {visible && (
              <div
                className="ant-wrapper"
                ref={(elem) => (this.container = elem)}
              >
                <ContainerDimensions>
                  {({ width, height }) => {
                    return (
                      (inViewport || renderOutsideViewPort) && (
                        <Row style={{ width }} gutter={[margins.gap, 0]}>
                          <Col flex={1}>
                            <BarPlot
                              {...{
                                width,
                                height,
                                dataPoints,
                                referenceDataPoints,
                                legend,
                                xTitle,
                                xVariable,
                                xFormat,
                                xAxisRotation,
                                yTitle,
                                yVariable,
                                yFormat,
                                xRange,
                                yRange,
                                colorVariable,
                              }}
                            />
                          </Col>
                        </Row>
                      )
                    );
                  }}
                </ContainerDimensions>
              </div>
            )}
          </Card>
        </Skeleton>
      </Wrapper>
    );
  }
}
BarPlotPanel.propTypes = {};
BarPlotPanel.defaultProps = {
  visible: true,
  referenceDataPoints: [],
};
const mapDispatchToProps = () => ({});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.App.renderOutsideViewPort,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(BarPlotPanel, { rootMargin: "-1.0px" })
  )
);
