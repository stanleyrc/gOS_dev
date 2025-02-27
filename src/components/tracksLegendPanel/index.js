import React, { Component } from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
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
  Spin,
  Select,
  Segmented,
} from "antd";
import * as d3 from "d3";
import { AiOutlineDownload } from "react-icons/ai";
import { LoadingOutlined } from "@ant-design/icons";
import { downloadCanvasAsPng, locateGenomeRange } from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import { AiFillBoxPlot } from "react-icons/ai";
import Wrapper from "./index.style";
import GenesPlot from "../genesPlotHiglass";
import settingsActions from "../../redux/settings/actions";
import genesActions from "../../redux/genes/actions";
import CytobandsPlot from "../cytobandsPlot";
import LegendMultiBrush from "../legendPanel/legend-multi-brush";
import GenomeRangePanel from "../legendPanel/genomeRangePanel";

const { updateDomains } = settingsActions;
const { locateGenes } = genesActions;

const margins = {
  padding: 0,
  gap: 0,
};

class TracksLegendPanel extends Component {
  container = null;
  genesStructure = null;

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props
            .t("components.genes-panel.header")
            .replace(/\s+/g, "_")
            .toLowerCase()}.png`
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
      genesList,
      domains,
      genesOptionsList,
      locateGenes,
      chromoBins,
      selectedCoordinate,
      visible,
      handleSegmentedChange,
    } = this.props;
    if (!visible) {
      return null;
    }
    return (
      <Wrapper>
        <Card
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <AiFillBoxPlot />
              </span>
              <span>{selectedCoordinate}</span>
              <span>
                {domains
                  .map((domain) => locateGenomeRange(chromoBins, domain))
                  .join(" | ")}
              </span>
              {loading ? (
                <Spin
                  indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />}
                />
              ) : (
                <span>
                  <b>{d3.format(",")(genesList.length)}</b>{" "}
                  {t("components.tracks-legend-panel.record", {
                    count: genesList.length,
                  })}
                </span>
              )}
            </Space>
          }
          extra={
            <Space>
              <Segmented
                options={[
                  {
                    label: t("components.segmented-filter.commonYscale"),
                    value: "common",
                  },
                  {
                    label: t("components.segmented-filter.individualYscale"),
                    value: "individual",
                  },
                ]}
                onChange={(d) => handleSegmentedChange(d)}
              />
              <GenomeRangePanel />
              <Select
                allowClear
                showSearch
                mode="multiple"
                style={{ width: 300 }}
                placeholder={t("components.genes-panel.locator")}
                onChange={locateGenes}
                options={genesOptionsList}
                optionFilterProp="children"
                filterOption={(input, option) =>
                  (option?.label.toLowerCase() ?? "").includes(
                    input.toLowerCase()
                  )
                }
                filterSort={(optionA, optionB) =>
                  (optionA?.label ?? "")
                    .toLowerCase()
                    .localeCompare((optionB?.label ?? "").toLowerCase())
                }
              />
              <Tooltip title={t("components.download-as-png-tooltip")}>
                <Button
                  type="default"
                  shape="circle"
                  icon={<AiOutlineDownload />}
                  size="small"
                  onClick={() => this.onDownloadButtonClicked()}
                />
              </Tooltip>
            </Space>
          }
        >
          {
            <div
              className="ant-wrapper"
              ref={(elem) => (this.container = elem)}
            >
              <ContainerDimensions>
                {({ width, height }) => {
                  return (
                    <Row style={{ width }} gutter={[margins.gap, 0]}>
                      <Col span={24}>
                        <LegendMultiBrush
                          className="ant-wrapper-legend"
                          {...{ width: width - 2 * margins.padding }}
                        />
                      </Col>
                      <Col span={24}>
                        <GenesPlot
                          {...{
                            width,
                            height: height / 2.5,
                            domains,
                            genesList,
                          }}
                        />
                      </Col>
                      <Col span={24}>
                        <CytobandsPlot
                          {...{
                            width,
                            height: height / 2,
                            domains,
                          }}
                        />
                      </Col>
                    </Row>
                  );
                }}
              </ContainerDimensions>
            </div>
          }
        </Card>
      </Wrapper>
    );
  }
}
TracksLegendPanel.propTypes = {};
TracksLegendPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
  locateGenes: (genesIndexes) => dispatch(locateGenes(genesIndexes)),
});
const mapStateToProps = (state) => ({
  domains: state.Settings.domains,
  chromoBins: state.Settings.chromoBins,
  selectedCoordinate: state.Settings.selectedCoordinate,
  genesOptionsList: state.Genes.optionsList,
  renderOutsideViewPort: state.App.renderOutsideViewPort,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(TracksLegendPanel, { rootMargin: "-1.0px" })
  )
);
