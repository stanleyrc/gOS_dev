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
} from "antd";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import { GiBubbles } from "react-icons/gi";
import {
  downloadCanvasAsPng,
  transitionStyle,
  densityPlotTypes,
} from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import Wrapper from "./index.style";
import DensityPlot from "../densityPlot";

const margins = {
  padding: 0,
  gap: 0,
};

class DensityPlotPanel extends Component {
  container = null;

  state = { plotType: densityPlotTypes()[0] };

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

  handlePlotTypeSelectionChange = (plotType) => {
    this.setState({ plotType });
  };

  render() {
    const {
      t,
      loading,
      dataPoints,
      xTitle,
      xVariable,
      xRange,
      xFormat,
      yTitle,
      yVariable,
      yRange,
      yFormat,
      title,
      inViewport,
      renderOutsideViewPort,
      visible,
      colorVariable,
    } = this.props;

    const { plotType } = this.state;
    return (
      <Wrapper visible={visible}>
        <Card
          style={transitionStyle(inViewport || renderOutsideViewPort)}
          loading={loading}
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <GiBubbles />
              </span>
              <span className="ant-pro-menu-item-title">{title}</span>
            </Space>
          }
          extra={
            <Space>
              <span>{t(`components.variantQc-panel.plot-label`)}</span>
              <Segmented
                size="small"
                options={densityPlotTypes().map((d) => {
                  return {
                    value: d,
                    label: t(`components.variantQc-panel.${d}`),
                  };
                })}
                value={plotType}
                onChange={this.handlePlotTypeSelectionChange}
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
                          <DensityPlot
                            {...{
                              width,
                              height,
                              dataPoints,
                              xTitle,
                              xVariable,
                              xFormat,
                              yTitle,
                              yVariable,
                              yFormat,
                              xRange,
                              yRange,
                              plotType,
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
      </Wrapper>
    );
  }
}
DensityPlotPanel.propTypes = {};
DensityPlotPanel.defaultProps = {
  visible: true,
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
    handleViewport(DensityPlotPanel, { rootMargin: "-1.0px" })
  )
);
