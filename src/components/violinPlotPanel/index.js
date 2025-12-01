import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import ContainerDimensions from "react-container-dimensions";
import handleViewport from "react-in-viewport";
import { Card, Space, Tooltip, Button, message, Row, Col } from "antd";
import { withTranslation } from "react-i18next";
import { TbChartCandleFilled } from "react-icons/tb";
import { AiOutlineDownload } from "react-icons/ai";
import { downloadCanvasAsPng, transitionStyle } from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import Wrapper from "./index.style";
import ViolinPlot from "../violinPlot";

const margins = {
  padding: 0,
  gap: 0,
};

class ViolinPlotPanel extends Component {
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
      plots,
      markers,
      title,
      loading,
      inViewport,
      renderOutsideViewPort,
      visible,
    } = this.props;
    return (
      <Wrapper visible={visible}>
        <Card
          style={transitionStyle(inViewport || renderOutsideViewPort)}
          loading={loading}
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <TbChartCandleFilled />
              </span>
              <span className="ant-pro-menu-item-title">{title}</span>
            </Space>
          }
          extra={
            <Space>
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
                          <ViolinPlot
                            {...{
                              width,
                              height,
                              plots,
                              markers,
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
ViolinPlotPanel.propTypes = {
  data: PropTypes.array,
  markValue: PropTypes.number,
  visible: PropTypes.bool,
};
ViolinPlotPanel.defaultProps = {
  data: [],
  visible: true,
  plots: [],
};
const mapDispatchToProps = () => ({});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.Settings.renderOutsideViewPort,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(ViolinPlotPanel, { rootMargin: "-1.0px" })
  )
);
