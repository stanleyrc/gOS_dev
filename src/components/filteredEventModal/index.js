import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import handleViewport from "react-in-viewport";
import {
  Row,
  Col,
  Modal,
  message,
  Space,
  Button,
  Descriptions,
  Tag,
  Avatar,
  Typography,
  Tabs,
  Input,
} from "antd";
import NotesModal from "../notesModal";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import { roleColorMap, tierColor } from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import { downloadCanvasAsPng } from "../../helpers/utility";
import Wrapper from "./index.style";
import TracksModal from "../tracksModal";

const { Text } = Typography;

const { Item } = Descriptions;

class FilteredEventModal extends Component {
  container = null;

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.modalTitleText.replace(/\s+/g, "_").toLowerCase()}.png`
        );
      })
      .catch((error) => {
        message.error(this.props.t("general.error", { error }));
      });
  };

  render() {
    const {
      t,
      record,
      handleOkClicked,
      handleCancelClicked,
      width,
      open,
      genome,
      mutations,
      chromoBins,
      genomeCoverage,
      methylationBetaCoverage,
      methylationIntensityCoverage,
      hetsnps,
      genes,
      igv,
      allelic,
    } = this.props;

    if (!open) return null;

    const {
      gene,
      name,
      type,
      role,
      tier,
      location,
      therapeutics,
      resistances,
      effect,
      prognoses,
      variant_summary,
      gene_summary,
      effect_description,
    } = record;

    let summaryContent = (
      <Row
        className="ant-panel-container ant-home-plot-container"
        gutter={[16, 24]}
      >
        <Col className="gutter-row" span={24}>
          <Descriptions
            title={t("components.filtered-events-panel.info")}
            bordered
            layout="vertical"
          >
            <Item label={t("components.filtered-events-panel.gene")}>
              <a
                href="#/"
                onClick={(e) => {
                  e.preventDefault();
                  window
                    .open(
                      `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${gene}`,
                      "_blank"
                    )
                    .focus();
                }}
              >
                {gene}
              </a>
            </Item>
            <Item label={t("components.filtered-events-panel.tier")}>
              {tier ? (
                <Space>
                  <Avatar
                    size="small"
                    style={{
                      color: "#FFF",
                      backgroundColor: tierColor(+tier),
                    }}
                  >
                    {tier}
                  </Avatar>
                  {t(`components.filtered-events-panel.tier-info.${tier}`)}
                </Space>
              ) : (
                <Text italic disabled>
                  {t("general.unavailable")}
                </Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.effect")}>
              {effect ? (
                effect
              ) : (
                <Text italic disabled>
                  {t("general.unavailable")}
                </Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.gene_summary")}>
              {gene_summary ? (
                gene_summary
              ) : (
                <Text italic disabled>
                  {t("general.unavailable")}
                </Text>
              )}
            </Item>
            <Item
              label={t("components.filtered-events-panel.effect_description")}
            >
              {effect_description ? (
                effect_description
              ) : (
                <Text italic disabled>
                  {t("general.unavailable")}
                </Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.variant_summary")}>
              {variant_summary ? (
                variant_summary
              ) : (
                <Text italic disabled>
                  {t("general.unavailable")}
                </Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.resistances")}>
              {resistances ? (
                resistances
              ) : (
                <Text italic disabled>
                  {t("general.unavailable")}
                </Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.therapeutics")}>
              {therapeutics ? (
                therapeutics
              ) : (
                <Text italic disabled>
                  {t("general.unavailable")}
                </Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.prognoses")}>
              {prognoses ? (
                prognoses
              ) : (
                <Text italic disabled>
                  {t("general.unavailable")}
                </Text>
              )}
            </Item>
          </Descriptions>
        </Col>
      </Row>
    );

    const items = [
      {
        key: "filtered-event-summary",
        label: "Summary",
        children: summaryContent,
      },
      {
        key: "filtered-event-plots",
        label: "Plots",
        children: (
          <TracksModal
            {...{
              loading: genome.loading,
              genome,
              mutations,
              genomeCoverage,
              methylationBetaCoverage,
              methylationIntensityCoverage,
              hetsnps,
              genes,
              igv,
              chromoBins,
              allelic,
              modalTitle: "",
              genomePlotTitle: t("components.tracks-modal.genome-plot"),
              genomePlotYAxisTitle: t(
                "components.tracks-modal.genome-y-axis-title"
              ),
              coveragePlotTitle: t("components.tracks-modal.coverage-plot"),
              coverageYAxisTitle: t(
                "components.tracks-modal.coverage-y-axis-title"
              ),
              coverageYAxis2Title: t(
                "components.tracks-modal.coverage-y-axis2-title"
              ),
              methylationBetaCoveragePlotTitle: t(
                "components.tracks-modal.methylation-beta-coverage-plot"
              ),
              methylationBetaCoverageYAxisTitle: t(
                "components.tracks-modal.methylation-beta-coverage-y-axis-title"
              ),
              methylationBetaCoverageYAxis2Title: t(
                "components.tracks-modal.methylation-beta-coverage-y-axis2-title"
              ),
              methylationIntensityCoveragePlotTitle: t(
                "components.tracks-modal.methylation-intensity-coverage-plot"
              ),
              methylationIntensityCoverageYAxisTitle: t(
                "components.tracks-modal.methylation-intensity-coverage-y-axis-title"
              ),
              methylationIntensityCoverageYAxis2Title: t(
                "components.tracks-modal.methylation-intensity-coverage-y-axis2-title"
              ),
              hetsnpPlotTitle: t("components.tracks-modal.hetsnp-plot"),
              hetsnpPlotYAxisTitle: t(
                "components.tracks-modal.hetsnp-plot-y-axis-title"
              ),
              hetsnpPlotYAxis2Title: t(
                "components.tracks-modal.hetsnp-plot-y-axis2-title"
              ),
              mutationsPlotTitle: t("components.tracks-modal.mutations-plot"),
              mutationsPlotYAxisTitle: t(
                "components.tracks-modal.mutations-plot-y-axis-title"
              ),
              allelicPlotTitle: t("components.tracks-modal.allelic-plot"),
              allelicPlotYAxisTitle: t(
                "components.tracks-modal.allelic-plot-y-axis-title"
              ),
              handleOkClicked: () => {},
              handleCancelClicked: () => {},
              open: true,
              viewType: "inline",
            }}
          />
        ),
      },
      {
        key: "filtered-event-notes",
        label: "gOS AI",
        children: <NotesModal record={record} />,
      },
    ];

    return (
      <Wrapper visible={open}>
        <Modal
          title={
            <Space>
              {gene}
              {name}
              {type}
              {role?.split(",").map((tag) => (
                <Tag color={roleColorMap()[tag.trim()]} key={tag.trim()}>
                  {tag.trim()}
                </Tag>
              ))}
              {tier}
              {location}
              <Button
                type="default"
                shape="circle"
                icon={<AiOutlineDownload />}
                size="small"
                onClick={() => this.onDownloadButtonClicked()}
              />
            </Space>
          }
          centered
          open={open}
          onOk={handleOkClicked}
          onCancel={handleCancelClicked}
          width={width}
          footer={null}
          forceRender={true}
        >
          <div ref={(elem) => (this.container = elem)}>
            <Tabs defaultActiveKey="filtered-event-summary" items={items} />
          </div>
        </Modal>
      </Wrapper>
    );
  }
}

FilteredEventModal.propTypes = {};
FilteredEventModal.defaultProps = {
  width: 1800,
  height: 180,
  viewType: "modal",
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  genome: state.Genome,
  mutations: state.Mutations,
  allelic: state.Allelic,
  chromoBins: state.Settings.chromoBins,
  genomeCoverage: state.GenomeCoverage,
  methylationBetaCoverage: state.MethylationBetaCoverage,
  methylationIntensityCoverage: state.MethylationIntensityCoverage,
  hetsnps: state.Hetsnps,
  genes: state.Genes,
  igv: state.Igv,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(FilteredEventModal, { rootMargin: "-1.0px" })
  )
);
