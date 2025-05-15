import React, { Component } from "react";
import { connect } from "react-redux";
import { Resizable } from "react-resizable";
import handleViewport from "react-in-viewport";
import {
  Card,
  Space,
  Button,
  Tooltip,
  message,
  Row,
  Col,
  Typography,
  Popover,
} from "antd";
import * as d3 from "d3";
import { withTranslation } from "react-i18next";
import Wrapper from "./index.style";
import { AiOutlineDownload, AiOutlineDotChart } from "react-icons/ai";
import { CgArrowsBreakeH } from "react-icons/cg";
import { WarningOutlined } from "@ant-design/icons";
import {
  downloadCanvasAsPng,
  transitionStyle,
  domainsToLocation,
} from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import ScatterPlot from "../scatterPlot";
import ErrorPanel from "../errorPanel";

const { Text } = Typography;

const margins = {
  padding: 0,
  gap: 27,
  maxHeight: 500,
};

class ScatterPlotPanel extends Component {
  constructor(props) {
    super(props);
    this.container = null;
    this.state = {
      parentWidth: null,
      width: 0,
      height: this.props.height,
    };
  }

  componentDidMount() {
    this.updateWidth();
    window.addEventListener("resize", this.updateWidth);
  }

  componentDidUpdate(prevProps, prevState) {
    // Check if the parent width has changed after the update
    if (prevState.parentWidth !== this.state.parentWidth) {
      this.updateWidth();
    }
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.updateWidth);
  }

  updateWidth = () => {
    if (this.container) {
      this.setState({
        parentWidth: this.container.getBoundingClientRect().width,
      });
    }
  };

  // On top layout
  onFirstBoxResize = (event, { element, size, handle }) => {
    this.setState({
      width: size.width,
      height: d3.min([
        d3.max([size.height, this.props.height]),
        margins.maxHeight,
      ]),
    });
  };

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
      dataPointsY1,
      dataPointsY2,
      dataPointsX,
      dataPointsColor,
      error,
      filename,
      title,
      domains,
      inViewport,
      renderOutsideViewPort,
      visible,
      zoomedByCmd,
      yAxisTitle,
      yAxis2Title,
      notification,
      commonRangeY,
    } = this.props;
    if (!visible) return null;
    const { parentWidth, height } = this.state;
    let { gap } = margins;
    //if (!data) return null;
    let w = parentWidth || this.container?.getBoundingClientRect().width;
    let h = height;
    return (
      <Wrapper visible={visible} ref={(elem) => (this.container = elem)}>
        {error ? (
          <ErrorPanel
            avatar={<CgArrowsBreakeH />}
            header={
              <Space>
                <span role="img" className="anticon anticon-dashboard">
                  <AiOutlineDotChart />
                </span>
                <span className="ant-pro-menu-item-title">{title}</span>
              </Space>
            }
            title={t("components.coverage-panel.error.title")}
            subtitle={t("components.coverage-panel.error.subtitle", {
              filename,
            })}
            explanationTitle={t(
              "components.coverage-panel.error.explanation.title"
            )}
            explanationDescription={error.stack}
          />
        ) : (
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
                    {
                      <span>
                        <b>{d3.format(",")(dataPointsX.length)}</b>{" "}
                        {t("components.coverage-panel.datapoint", {
                          count: dataPointsX.length,
                        })}
                      </span>
                    }
                    {notification.status && (
                      <Popover
                        placement="bottomLeft"
                        title={
                          <Space>
                            <Text>{notification.heading}</Text>
                          </Space>
                        }
                        content={
                          <Space direction="vertical">
                            {notification.messages.map((d,i) => (
                              <Text key={i}>
                                <span
                                  dangerouslySetInnerHTML={{
                                    __html: d,
                                  }}
                                />
                              </Text>
                            ))}
                          </Space>
                        }
                        trigger="hover"
                      >
                        <Text type="warning">
                          <WarningOutlined />
                        </Text>
                      </Popover>
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
            {visible && w > 0 && (
              <Resizable
                className="box"
                height={this.state.height}
                width={w - gap}
                onResize={this.onFirstBoxResize}
                resizeHandles={["sw", "se", "s"]}
                draggableOpts={{ grid: [25, 25] }}
              >
                <div
                  className="ant-wrapper"
                  style={{
                    width: w - gap + "px",
                    height: this.state.height + "px",
                  }}
                >
                  {(inViewport || renderOutsideViewPort) && (
                    <Row>
                      <Col flex={1}>
                        <ScatterPlot
                          {...{
                            width: w - gap,
                            height: h,
                            dataPointsY1,
                            dataPointsY2,
                            dataPointsX,
                            dataPointsColor,
                            domains,
                            yAxisTitle,
                            yAxis2Title,
                            commonRangeY,
                          }}
                        />
                      </Col>
                    </Row>
                  )}
                </div>
              </Resizable>
            )}
          </Card>
        )}
      </Wrapper>
    );
  }
}
ScatterPlotPanel.propTypes = {};
ScatterPlotPanel.defaultProps = {
  notification: { status: null, heading: null, messages: [] },
  commonRangeY: null
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  domains: state.Settings.domains,
  chromoBins: state.Settings.chromoBins,
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
