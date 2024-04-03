import React, { Component } from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import ContainerDimensions from "react-container-dimensions";
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
import appActions from "../../redux/app/actions";

const { updateDomains } = appActions;

const { Text } = Typography;

const margins = {
  padding: 0,
  annotations: { minDistance: 10000000, padding: 1000, maxClusters: 6 },
};

class GenomePanel extends Component {
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
      genome,
      title,
      yAxisTitle,
      inViewport,
      renderOutsideViewPort,
      visible,
      zoomedByCmd,
      chromoBins,
      domains,
      height,
      mutationsPlot,
    } = this.props;
    if (Object.keys(genome).length < 1) return null;
    return (
      <Wrapper visible={visible} height={height}>
        <Card
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
          {visible && (
            <div
              className="ant-wrapper"
              ref={(elem) => (this.container = elem)}
            >
              <ContainerDimensions>
                {({ width, height }) => {
                  return (
                    (inViewport || renderOutsideViewPort) && (
                      <GenomePlot
                        {...{
                          width: width - 2 * margins.padding,
                          height,
                          genome,
                          mutationsPlot,
                          yAxisTitle,
                        }}
                      />
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
GenomePanel.propTypes = {};
GenomePanel.defaultProps = {
  height: 400,
  mutationsPlot: false,
};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.App.renderOutsideViewPort,
  genomeLength: state.App.genomeLength,
  zoomedByCmd: state.App.zoomedByCmd,
  domains: state.App.domains,
  chromoBins: state.App.chromoBins,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(GenomePanel, { rootMargin: "-1.0px" })
  )
);
