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
  Input,
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
import LegendMultiBrush from "./legend-multi-brush";
import GenomeRangePanel from "./genomeRangePanel";

const { updateDomains } = settingsActions;
const { locateGenes } = genesActions;

const margins = {
  padding: 0,
  gap: 0,
};

class TracksLegendPanel extends Component {
  container = null;
  genesStructure = null;

  state = { locationString: null };

  handleLocationChange = (e) => {
    this.setState({ locationString: e.target.value });
  };

  handleLocationKeyPress = (e) => {
    if (e.key === "Enter") {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("location", this.state.locationString);
      window.location.href = currentUrl.toString();
    }
  };

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
      handleYscaleModeChange,
      yScaleMode,
    } = this.props;
    if (!visible) {
      return null;
    }

    let locationString =
      this.state.locationString ||
      domains
        .map((domain) => locateGenomeRange(chromoBins, domain))
        .join(" | ");
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
              <Tooltip
                title={t("components.tracks-legend-panel.location-help")}
              >
                <Input
                  className="location-input"
                  size="small"
                  value={locationString}
                  onChange={this.handleLocationChange}
                  onPressEnter={this.handleLocationKeyPress}
                  placeholder={t(
                    "components.tracks-legend-panel.location-placeholder"
                  )}
                />
              </Tooltip>
            </Space>
          }
          extra={
            <Space>
              {loading ? (
                <Spin
                  indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />}
                />
              ) : (
                <span
                  className="gene-records-text"
                  dangerouslySetInnerHTML={{
                    __html: t("components.tracks-legend-panel.record", {
                      count: genesList.length,
                      countText: d3.format(",")(genesList.length),
                    }),
                  }}
                />
              )}
              <Select
                defaultValue={yScaleMode}
                variant="borderless"
                onChange={(d) => handleYscaleModeChange(d)}
                options={[
                  {
                    value: "common",
                    label: (
                      <Tooltip
                        placement="leftTop"
                        title={t(
                          "components.tracks-legend-panel.commonYscale-help"
                        )}
                      >
                        <Space>
                          {t("components.tracks-legend-panel.commonYscale")}
                        </Space>
                      </Tooltip>
                    ),
                  },
                  {
                    value: "individual",
                    label: (
                      <Tooltip
                        placement="leftTop"
                        title={t(
                          "components.tracks-legend-panel.individualYscale-help"
                        )}
                      >
                        <Space>
                          {t("components.tracks-legend-panel.individualYscale")}
                        </Space>
                      </Tooltip>
                    ),
                  },
                ]}
              />
              <GenomeRangePanel />
              <Select
                size="small"
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
  selectedCoordinate: state.Settings.dataset?.reference,
  genesOptionsList: state.Genes.optionsList,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(TracksLegendPanel, { rootMargin: "-1.0px" })
  )
);
