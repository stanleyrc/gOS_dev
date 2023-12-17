import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import ContainerDimensions from "react-container-dimensions";
import handleViewport from "react-in-viewport";
import { Card, Space, Tooltip, Button, message, Row, Col, Modal } from "antd";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import { GiHistogram } from "react-icons/gi";
import GenomePanel from "../genomePanel";
import {
  downloadCanvasAsPng,
  transitionStyle,
  locationToDomains,
} from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import * as d3 from "d3";
import Wrapper from "./index.style";
import BinPlot from "../binPlot";
import appActions from "../../redux/app/actions";

const { updateDomains } = appActions;

const margins = {
  padding: 0,
  gap: 0,
};

class BinPlotPanel extends Component {
  container = null;

  state = {
    segment: null,
    open: false,
  };

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

  handleSelectSegment = (segment) => {
    const { chromoBins, updateDomains } = this.props;
    let location = `${segment.chromosome}:${segment.startPoint}-${segment.chromosome}:${segment.endPoint}`;
    let domains = locationToDomains(chromoBins, location);
    domains = domains.map((d) => [
      Math.floor((19 * d[0] - d[1]) / 18),
      Math.floor((19 * d[1] - d[0]) / 18),
    ]);
    this.setState({ segment, open: true }, () => updateDomains(domains));
  };

  render() {
    const {
      t,
      loading,
      data,
      title,
      inViewport,
      renderOutsideViewPort,
      visible,
      xTitle,
      yTitle,
      chromoBins,
      slope,
      intercept,
    } = this.props;

    const { segment, open } = this.state;
    return (
      <Wrapper visible={visible}>
        <Card
          style={transitionStyle(inViewport || renderOutsideViewPort)}
          loading={loading}
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <GiHistogram />
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
                          <BinPlot
                            {...{
                              width,
                              height,
                              data: data.intervals,
                              xTitle,
                              yTitle,
                              selectSegment: (e) => this.handleSelectSegment(e),
                              slope,
                              intercept,
                            }}
                          />
                          {segment && (
                            <Modal
                              title={
                                <span
                                  dangerouslySetInnerHTML={{
                                    __html: t(
                                      "components.binQc-panel.modal-title",
                                      {
                                        iid: segment.iid,
                                        chromosome: segment.chromosome,
                                        width: d3.format(",")(segment.width),
                                        mean: segment.mean,
                                      }
                                    ),
                                  }}
                                />
                              }
                              centered
                              open={open}
                              onOk={() => this.setState({ open: false })}
                              onCancel={() => this.setState({ open: false })}
                              width={1200}
                            >
                              <GenomePanel
                                {...{
                                  loading,
                                  genome: data,
                                  title: t(
                                    "components.binQc-panel.genome-plot"
                                  ),
                                  chromoBins,
                                  visible: true,
                                  index: 0,
                                  height: 700,
                                }}
                              />
                            </Modal>
                          )}
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
BinPlotPanel.propTypes = {
  data: PropTypes.array,
};
BinPlotPanel.defaultProps = {
  data: { intervals: [], connections: [] },
  visible: true,
};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.App.renderOutsideViewPort,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(BinPlotPanel, { rootMargin: "-1.0px" })
  )
);
