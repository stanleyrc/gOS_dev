import React, { Component } from "react";
import { connect } from "react-redux";
import ContainerDimensions from "react-container-dimensions";
import handleViewport from "react-in-viewport";
import {
  Card,
  Space,
  Button,
  Tooltip,
  message,
  Row,
  Col,
  Alert,
  Typography,
} from "antd";
import * as d3 from "d3";
import { withTranslation } from "react-i18next";
import { AiOutlineDotChart } from "react-icons/ai";
import Wrapper from "./index.style";
import { AiOutlineDownload } from "react-icons/ai";
import {
  downloadCanvasAsPng,
  transitionStyle,
  domainsToLocation,
} from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import ScatterPlot from "../scatterPlot";

const { Text } = Typography;

const margins = {
  padding: 0,
  gap: 0,
};

class ScatterPlotPanel extends Component {
  container = null;

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.title
            .replace(/\s+/g, "_")
            .toLowerCase()}_${domainsToLocation(
            this.props.chromoBins,
            this.props.domains
          )}.png`
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
      data,
      title,
      domains,
      inViewport,
      renderOutsideViewPort,
      visible,
      zoomedByCmd,
      height,
      width,
    } = this.props;
    return (
      <Wrapper visible={visible} height={height}>
        <Card
          style={transitionStyle(inViewport || renderOutsideViewPort)}
          loading={loading}
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <AiOutlineDotChart />
              </span>
              <span className="ant-pro-menu-item-title">
                <Space>
                  {title}
                  {data ? (
                    <span>
                      <b>{d3.format(",")(data.numRows)}</b>{" "}
                      {t("components.coverage-panel.datapoint", {
                        count: data.numRows,
                      })}
                    </span>
                  ) : (
                    <Text type="danger">{t("general.invalid-arrow-file")}</Text>
                  )}
                </Space>
              </span>
            </Space>
          }
          extra={
            <Space>
              {zoomedByCmd && (
                <Text type="secondary">{t("components.zoom-help")}</Text>
              )}
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
              <Row style={{ width, height }} gutter={[margins.gap, 0]}>
                <Col flex={1}>
                  {data ? (
                    <ScatterPlot
                      {...{
                        width,
                        height,
                        data,
                        domains,
                      }}
                    />
                  ) : (
                    <Alert
                      message={t("general.invalid-arrow-file")}
                      description={t("general.invalid-arrow-file-detail")}
                      type="error"
                      showIcon
                    />
                  )}
                </Col>
              </Row>
            </div>
          )}
        </Card>
      </Wrapper>
    );
  }
}
ScatterPlotPanel.propTypes = {};
ScatterPlotPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  domains: state.App.domains,
  chromoBins: state.App.chromoBins,
  renderOutsideViewPort: state.App.renderOutsideViewPort,
  zoomedByCmd: state.App.zoomedByCmd,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(ScatterPlotPanel, { rootMargin: "-1.0px" })
  )
);
