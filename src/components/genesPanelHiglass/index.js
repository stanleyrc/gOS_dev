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
} from "antd";
import * as d3 from "d3";
import { AiOutlineDownload } from "react-icons/ai";
import { LoadingOutlined } from "@ant-design/icons";
import { downloadCanvasAsPng, merge, cluster } from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import { CgArrowsBreakeH } from "react-icons/cg";
import Wrapper from "./index.style";
import GenesPlot from "../genesPlotHiglass";
import settingsActions from "../../redux/settings/actions";
import genesActions from "../../redux/genes/actions";

const { updateDomains } = settingsActions;
const { locateGenes } = genesActions;

const margins = {
  padding: 0,
  gap: 0,
};

class GenesPanel extends Component {
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
      visible,
    } = this.props;
    if (!visible) {
      return null;
    }
    return (
      <Wrapper>
        {
          <Card
            size="small"
            title={
              <Space>
                <span role="img" className="anticon anticon-dashboard">
                  <CgArrowsBreakeH />
                </span>
                <span className="ant-pro-menu-item-title">
                  {t("components.genes-panel.header")}
                </span>
                {loading ? (
                  <Spin
                    indicator={
                      <LoadingOutlined style={{ fontSize: 16 }} spin />
                    }
                  />
                ) : (
                  <span>
                    <b>{d3.format(",")(genesList.length)}</b>{" "}
                    {t("components.genes-panel.gene", {
                      count: genesList.length,
                    })}
                  </span>
                )}
              </Space>
            }
            extra={
              <Space>
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
                        <Col flex={1}>
                          <GenesPlot
                            {...{
                              width,
                              height,
                              domains,
                              genesList,
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
        }
      </Wrapper>
    );
  }
}
GenesPanel.propTypes = {};
GenesPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
  locateGenes: (genesIndexes) => dispatch(locateGenes(genesIndexes)),
});
const mapStateToProps = (state) => ({
  domains: state.Settings.domains,
  genesOptionsList: state.Genes.optionsList,
  renderOutsideViewPort: state.App.renderOutsideViewPort,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(GenesPanel, { rootMargin: "-1.0px" })
  )
);
