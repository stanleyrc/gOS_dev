import React, { Component } from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { Resizable } from "react-resizable";
import * as d3 from "d3";
import handleViewport from "react-in-viewport";
import { Card, Space, Button, Tooltip, message, Typography } from "antd";
import { GiDna2 } from "react-icons/gi";
import { AiOutlineDownload } from "react-icons/ai";
import {
  downloadCanvasAsPng,
  transitionStyle,
  domainsToLocation,
} from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import Wrapper from "./index.style";
import GenomePlot from "../genomePlot";

const { Text } = Typography;

const margins = {
  padding: 0,
  annotations: { minDistance: 10000000, padding: 1000, maxClusters: 6 },
  gap: 27,
  maxHeight: 500,
};

class GenomePanel extends Component {
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
      genome,
      title,
      yAxisTitle,
      inViewport,
      renderOutsideViewPort,
      visible,
      zoomedByCmd,
      chromoBins,
      domains,
      mutationsPlot,
    } = this.props;
    const { parentWidth, height } = this.state;
    let { gap } = margins;
    if (!genome || Object.keys(genome).length < 1) return null;
    let w = parentWidth || this.container?.getBoundingClientRect().width;
    return (
      <Wrapper visible={visible} ref={(elem) => (this.container = elem)}>
        <Card
          loading={loading}
          style={transitionStyle(inViewport || renderOutsideViewPort)}
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <GiDna2 />
              </span>
              <span className="ant-pro-menu-item-title">{title}</span>
              <span>{domainsToLocation(chromoBins, domains)}</span>
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
          {visible && w > 0 && genome && (
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
                  <GenomePlot
                    {...{
                      width: w - gap - 2 * margins.padding,
                      height,
                      genome,
                      mutationsPlot,
                      yAxisTitle,
                    }}
                  />
                )}
              </div>
            </Resizable>
          )}
        </Card>
      </Wrapper>
    );
  }
}
GenomePanel.propTypes = {};
GenomePanel.defaultProps = {
  height: 400,
  mutationsPlot: false,
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.App.renderOutsideViewPort,
  genomeLength: state.Settings.genomeLength,
  zoomedByCmd: state.App.zoomedByCmd,
  domains: state.Settings.domains,
  chromoBins: state.Settings.chromoBins,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(GenomePanel, { rootMargin: "-1.0px" })
  )
);
