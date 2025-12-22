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
  Typography,
} from "antd";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import { TbChartHistogram } from "react-icons/tb";
import { downloadCanvasAsPng, transitionStyle } from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import Wrapper from "./index.style";
import HistogramPlot from "../histogramPlot";

const { Text } = Typography;

const margins = {
  padding: 0,
  gap: 0,
};

class HistogramPlotPanel extends Component {
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
      id,
      data,
      dataset,
      q1,
      q3,
      q99,
      range,
      scaleX,
      bandwidth,
      markValue,
      markValueText,
      colorMarker,
      format,
      title,
      inViewport,
      visible,
    } = this.props;

    return (
      <Wrapper visible={visible}>
        <Card
          style={transitionStyle(inViewport)}
          loading={loading}
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <TbChartHistogram />
              </span>
              <span className="ant-pro-menu-item-title">
                <Text
                  style={
                    true
                      ? {
                          width: 500,
                        }
                      : undefined
                  }
                  ellipsis={
                    true
                      ? {
                          tooltip: title,
                        }
                      : false
                  }
                >
                  {title}
                </Text>
              </span>
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
                    (inViewport) && (
                      <Row style={{ width }} gutter={[margins.gap, 0]}>
                        <Col flex={1}>
                          <HistogramPlot
                            {...{
                              id,
                              width,
                              height,
                              data,
                              dataset,
                              q1,
                              q3,
                              q99,
                              range,
                              scaleX,
                              bandwidth,
                              markValue,
                              markValueText,
                              colorMarker,
                              format,
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
HistogramPlotPanel.propTypes = {
  data: PropTypes.array,
  markValue: PropTypes.number,
};
HistogramPlotPanel.defaultProps = {
  data: [],
};
const mapDispatchToProps = () => ({});
const mapStateToProps = (state) => ({
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(HistogramPlotPanel, { rootMargin: "-1.0px" })
  )
);
