import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import ContainerDimensions from "react-container-dimensions";
import handleViewport from "react-in-viewport";
import { Card, Space, Tooltip, Button, message, Row, Col } from "antd";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import { LuChartNoAxesGantt } from "react-icons/lu";

import { downloadCanvasAsPng, transitionStyle } from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import Wrapper from "./index.style";
import ParallelCoordinatesPlot from "../parallelCoordinatesPlot";

const margins = {
  padding: 0,
  gap: 0,
};

class ParallelCoordinatesPanel extends Component {
  container = null;

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.title.replace(/\s+/g, "_").toLowerCase()}.png`,
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
      title,
      inViewport,
      visible,
      handleCardClick,
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
                <LuChartNoAxesGantt />
              </span>
              <span className="ant-pro-menu-item-title">
                <span
                  dangerouslySetInnerHTML={{
                    __html:
                      title || t("components.parallel-coordinates-panel.title"),
                  }}
                />
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
                    inViewport && (
                      <Row style={{ width }} gutter={[margins.gap, 0]}>
                        <Col flex={1}>
                          <ParallelCoordinatesPlot
                            {...{
                              id,
                              width,
                              height,
                              data,
                              handleCardClick,
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
ParallelCoordinatesPanel.propTypes = {
  data: PropTypes.array,
  visible: PropTypes.bool,
  handleCardClick: PropTypes.func,
};
ParallelCoordinatesPanel.defaultProps = {
  data: [],
  visible: true,
  handleCardClick: null,
};
const mapDispatchToProps = () => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(
  withTranslation("common")(
    handleViewport(ParallelCoordinatesPanel, { rootMargin: "-1.0px" }),
  ),
);
