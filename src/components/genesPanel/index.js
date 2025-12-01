import React, { Component } from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import ContainerDimensions from "react-container-dimensions";
import handleViewport from "react-in-viewport";
import { Card, Space, Tooltip, Button, message, Row, Col, Select } from "antd";
import * as d3 from "d3";
import {
  AiOutlineDownload,
  AiOutlineDown,
  AiOutlineRight,
} from "react-icons/ai";
import {
  downloadCanvasAsPng,
  merge,
  cluster,
  domainsToLocation,
} from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import { CgArrowsBreakeH } from "react-icons/cg";
import Wrapper from "./index.style";
import GenesPlot from "../genesPlot";
import settingsActions from "../../redux/settings/actions";

const { updateDomains } = settingsActions;

const margins = {
  padding: 0,
  gap: 0,
};

class GenesPanel extends Component {
  container = null;
  genesStructure = null;
  state = { visible: false };

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props
            .t("components.genes-panel.header")
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

  handleGenesLocatorChange = (values) => {
    const { genomeLength, chromoBins, genes } = this.props;
    let selectedGenes = values.map((d, i) => genes.get(d).toJSON());
    let newDomains = selectedGenes.map((d, i) => [
      d3.max([Math.floor(0.99999 * d.startPlace), 1]),
      d3.min([Math.floor(1.00001 * d.endPlace), genomeLength]),
    ]);
    if (values.length < 1) {
      let firstChromosome = Object.values(chromoBins)[0];
      newDomains = [[firstChromosome.startPlace, firstChromosome.endPlace]];
      this.props.updateDomains(newDomains);
    } else {
      let merged = merge(
        newDomains
          .map((d) => {
            return { startPlace: d[0], endPlace: d[1] };
          })
          .sort((a, b) => d3.ascending(a.startPlace, b.startPlace))
      );
      this.props.updateDomains(cluster(merged, genomeLength));
    }
  };

  toggleVisibility = (visible) => {
    this.setState({ visible });
  };

  render() {
    const { t, genes, loading, loadingGenesData, domains, genesOptionsList } =
      this.props;
    let { visible } = this.state;
    return (
      <Wrapper>
        {
          <Card
            loading={visible && loading}
            size="small"
            title={
              <Space>
                <span role="img" className="anticon anticon-dashboard">
                  <CgArrowsBreakeH />
                </span>
                <span className="ant-pro-menu-item-title">
                  {t("components.genes-panel.header")}
                </span>
              </Space>
            }
            extra={
              <Space>
                <Select
                  allowClear
                  showSearch
                  mode="multiple"
                  loading={loadingGenesData}
                  style={{ width: 300 }}
                  placeholder={t("components.genes-panel.locator")}
                  onChange={this.handleGenesLocatorChange}
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
                <Tooltip
                  title={
                    visible ? t("components.collapse") : t("components.expand")
                  }
                >
                  <Button
                    type="text"
                    icon={
                      visible ? (
                        <AiOutlineDown style={{ marginTop: 5 }} />
                      ) : (
                        <AiOutlineRight style={{ marginTop: 5 }} />
                      )
                    }
                    size="small"
                    onClick={() => this.toggleVisibility(!visible)}
                  />
                </Tooltip>
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
            {visible && (
              <div
                className="ant-wrapper"
                ref={(elem) => (this.container = elem)}
              >
                <ContainerDimensions>
                  {({ width, height }) => {
                    return (
                      <Row style={{ width }} gutter={[margins.gap, 0]}>
                        <Col flex={1}>
                          {width && height && genes && (
                            <GenesPlot
                              {...{
                                width,
                                height,
                                domains,
                                genes,
                              }}
                            />
                          )}
                        </Col>
                      </Row>
                    );
                  }}
                </ContainerDimensions>
              </div>
            )}
          </Card>
        }
      </Wrapper>
    );
  }
}
GenesPanel.propTypes = {};
GenesPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
});
const mapStateToProps = (state) => ({
  domains: state.Settings.domains,
  renderOutsideViewPort: state.Settings.renderOutsideViewPort,
  chromoBins: state.Settings.chromoBins,
  genomeLength: state.Settings.genomeLength,
  selectedCoordinate: state.Settings.dataset?.reference,
  loading: state.Genes.loading,
  loadingGenesData: state.Genes.loadingGenesData,
  genesOptionsList: state.Genes.optionsList,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(GenesPanel, { rootMargin: "-1.0px" })
  )
);
