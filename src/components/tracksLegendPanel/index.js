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
import {
  downloadCanvasAsPng,
  locateGenomeRange,
  locationToDomains,
} from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import { AiFillBoxPlot } from "react-icons/ai";
import Wrapper from "./index.style";
import GeneTrack from "../genes/geneTrack";
import settingsActions from "../../redux/settings/actions";
import genesActions from "../../redux/genes/actions";
import CytobandsPlot from "../cytobandsPlot";
import LegendMultiBrush from "./legend-multi-brush";
import GenomeRangePanel from "./genomeRangePanel";
import HoverLine from "../hoverLine";

const { updateDomains } = settingsActions;
const { locateGenes } = genesActions;

const margins = {
  padding: 0,
  gap: 0,
};

export class TracksLegendPanel extends Component {
  container = null;
  genesStructure = null;

  // geneExtra: px the gene track needs beyond its share (squished / expanded isoforms); the panel grows by it
  state = { locationString: null, geneExtra: 0 };

  handleGeneHeight = (genesHeight, h) => {
    const extra = Math.max(0, Math.round(h - genesHeight));
    if (extra !== this.state.geneExtra) this.setState({ geneExtra: extra });
  };

  handleLocationChange = (e) => {
    this.setState({ locationString: e.target.value });
  };

  handleLocationBlur = () => {
    const { locationString } = this.state;
    if (locationString === null) return;
    if (!locationString.trim()) {
      this.setState({ locationString: null });
      return;
    }

    const { chromoBins, domains, updateDomains, t } = this.props;
    let nextDomains;
    try {
      nextDomains = locationToDomains(chromoBins, locationString);
    } catch {
      this.setState({ locationString: null });
      message.error(t("components.tracks-legend-panel.invalid-location"));
      return;
    }

    const unchanged =
      nextDomains.length === domains.length &&
      nextDomains.every(
        (domain, index) =>
          domain[0] === domains[index][0] && domain[1] === domains[index][1],
      );
    if (!unchanged) updateDomains(nextDomains);
    this.setState({ locationString: null });
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
            .toLowerCase()}.png`,
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
      compact = false,
      plotInsets = null,
      plotHeight = null,
      compactKeepsGenes = false,
      cellYscaleOption = false,
    } = this.props;
    if (!visible) {
      return null;
    }

    const locationString =
      this.state.locationString === null
        ? domains.map((domain) => locateGenomeRange(chromoBins, domain)).join("|")
        : this.state.locationString;
    return (
      <Wrapper>
        <Card
          size="small"
          className={compact ? "tracks-legend-compact" : undefined}
          title={compact ? null : (
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
                  onBlur={this.handleLocationBlur}
                  placeholder={t(
                    "components.tracks-legend-panel.location-placeholder",
                  )}
                />
              </Tooltip>
            </Space>
          )}
          extra={compact ? null : (
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
                  ...(cellYscaleOption
                    ? [
                        {
                          value: "cell",
                          label: (
                            <Tooltip placement="leftTop" title={t("components.tracks-legend-panel.cellYscale-help")}>
                              <Space>{t("components.tracks-legend-panel.cellYscale")}</Space>
                            </Tooltip>
                          ),
                        },
                      ]
                    : []),
                  {
                    value: "common",
                    label: (
                      <Tooltip
                        placement="leftTop"
                        title={t(
                          "components.tracks-legend-panel.commonYscale-help",
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
                          "components.tracks-legend-panel.individualYscale-help",
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
                    input.toLowerCase(),
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
          )}
        >
          {
            <div
              className="ant-wrapper"
              ref={(elem) => (this.container = elem)}
              style={{
                ...(compact
                  ? { height: compactKeepsGenes ? 150 + this.state.geneExtra : "auto" }
                  : { height: (plotHeight || 280) + this.state.geneExtra }),
                // Optional padding so the genome plots line up with another
                // view's genomic columns (the single-cell heatmap).
                ...(plotInsets
                  ? {
                      marginLeft: Math.max(0, plotInsets.left),
                      marginRight: Math.max(0, plotInsets.right),
                    }
                  : {}),
              }}
            >
              <ContainerDimensions>
                {({ width, height: fullHeight }) => {
                  const height = fullHeight - this.state.geneExtra;
                  // With a custom height, extra room goes to the gene track
                  // and the cytobands keep their default 120 px.
                  const genesHeight =
                    compact && compactKeepsGenes
                      ? Math.max(40, height - 70)
                      : plotHeight
                      ? Math.max(40, height - 144)
                      : height / 2.5;
                  const cytobandsHeight = plotHeight ? 120 : height / 2;
                  return (
                    <Row style={{ width }} gutter={[margins.gap, 0]}>
                      <Col span={24}>
                        <LegendMultiBrush
                          className="ant-wrapper-legend"
                          {...{ width: width - 2 * margins.padding }}
                        />
                      </Col>
                      {(!compact || compactKeepsGenes) && (
                      <Col span={24}>
                        <GeneTrack
                          width={width}
                          domains={domains}
                          maxHeight={Math.max(81, genesHeight - 28)}
                          onHeightChange={(h) => this.handleGeneHeight(genesHeight, h)}
                          exportName="genome-genes"
                        />
                      </Col>
                      )}
                      {!compact && (
                      <Col span={24}>
                        <CytobandsPlot
                          {...{
                            width,
                            height: cytobandsHeight,
                            domains,
                          }}
                        />
                        <HoverLine
                          width={width}
                          height={cytobandsHeight}
                          margins={{ gapX: 50, gapY: 24, gapYUnits: 2 }}
                        />
                      </Col>
                      )}
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
  mapDispatchToProps,
)(
  withTranslation("common")(
    handleViewport(TracksLegendPanel, { rootMargin: "-1.0px" }),
  ),
);
