import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { PageHeader } from "@ant-design/pro-components";
import {
  Space,
  Tag,
  Avatar,
  Tooltip,
  Divider,
  Popover,
  Typography,
  Button,
} from "antd";
import * as d3 from "d3";
import {
  legendColors,
  coverageQCFields,
  getColorMarker,
  orderListViewFilters,
  copyTextToClipboard,
} from "../../helpers/utility";
import { getNestedValue } from "../../helpers/metadata";
import {
  valueFormat,
  hrdFields,
  sv_countFields,
  headerList,
  msiFields,
  hrdDividers,
  msiLabels,
  qcMetricsClasses,
} from "../../helpers/metadata";
import Wrapper from "./index.style";
import { CbioportalModal } from "../cbioportal";
import cbioportalIcon from "../../assets/images/cbioportal_icon.png";
import { ClinicalTrialsModal } from "../clinicalTrialsModal";
import PatientCaseSwitcher from "../patientCaseSwitcher";
import ReportButtonsPanel from "../reportButtonsPanel";
import { CopyOutlined } from "@ant-design/icons";
import ctgovLogo from "../../assets/images/ctgov_logo.png";

const { Text } = Typography;
const COPY_TOOLTIP_DEFAULT_KEY = "components.header-panel.copy-tooltip-default";
const COPY_TOOLTIP_SUCCESS_KEY = "components.header-panel.copy-tooltip-success";
const COPY_TOOLTIP_FAILURE_KEY = "components.header-panel.copy-tooltip-failure";

class HeaderPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      cbioportalModalVisible: false,
      clinicalTrialsModalVisible: false,
      pairCopyTooltipKey: COPY_TOOLTIP_DEFAULT_KEY,
    };
    this.pairCopyResetTimeout = null;
  }

  handleCbioportalModalOpen = () => {
    this.setState({ cbioportalModalVisible: true });
  };

  handleCbioportalModalClose = () => {
    this.setState({ cbioportalModalVisible: false });
  };

  handleClinicalTrialsModalOpen = () => {
    this.setState({ clinicalTrialsModalVisible: true });
  };

  handleClinicalTrialsModalClose = () => {
    this.setState({ clinicalTrialsModalVisible: false });
  };

  componentWillUnmount() {
    if (this.pairCopyResetTimeout) {
      clearTimeout(this.pairCopyResetTimeout);
      this.pairCopyResetTimeout = null;
    }
  }

  resetPairCopyTooltip = () => {
    this.setState({ pairCopyTooltipKey: COPY_TOOLTIP_DEFAULT_KEY });
  };

  handlePairCopy = async () => {
    const pair = this.props.metadata?.pair;
    if (!pair) return;

    const copied = await copyTextToClipboard(`${pair}`);
    this.setState({
      pairCopyTooltipKey: copied ? COPY_TOOLTIP_SUCCESS_KEY : COPY_TOOLTIP_FAILURE_KEY,
    });

    if (this.pairCopyResetTimeout) {
      clearTimeout(this.pairCopyResetTimeout);
    }
    this.pairCopyResetTimeout = setTimeout(this.resetPairCopyTooltip, 1500);
  };

  renderPairTitle = (pair) => (
    <PatientCaseSwitcher
      pair={pair}
      copyControl={
        <Tooltip title={this.props.t(this.state.pairCopyTooltipKey)}>
          <button
            type="button"
            className="detail-title-copy-button"
            onClick={this.handlePairCopy}
            aria-label={this.props.t(
              "components.header-panel.copy-pair-aria-label",
            )}
          >
            <CopyOutlined />
          </button>
        </Tooltip>
      }
    />
  );

  renderTitle = () => {
    const { t, metadata, canReturnToResults, onBackToResults } = this.props;
    const pair = metadata?.pair;

    if (!pair) return null;

    if (!canReturnToResults) {
      return this.renderPairTitle(pair);
    }

    return (
      <span className="detail-title-breadcrumb">
        <button
          type="button"
          className="detail-title-breadcrumb-link"
          onClick={onBackToResults}
        >
          {t("containers.detail-view.breadcrumb.results")}
        </button>
        <span className="detail-title-breadcrumb-separator">/</span>
        <span className="detail-title-current">{this.renderPairTitle(pair)}</span>
      </span>
    );
  };

  render() {
    const { t, report, metadata, plots } = this.props;
    if (!report) return null;
    const {
      tumor_type,
      purity,
      ploidy,
      inferred_sex,
      disease,
      primary_site,
      tumor_details,
      treatment,
      treatment_type,
      treatment_best_response,
      treatment_duration,
      qcMetrics,
      qcEvaluation,
    } = metadata;

    let qcMetricsComponent = qcEvaluation ? (
      <Popover
        placement="bottomLeft"
        title={
          <Space>
            <Text>{t(`components.header-panel.qcMetrics`)}:</Text>
            <Text type={qcMetricsClasses[qcEvaluation.toLowerCase()]}>
              <strong>{qcEvaluation}</strong>
            </Text>
          </Space>
        }
        content={
          <Space direction="vertical">
            {qcMetrics.map((d, i) => (
              <Text key={i} type={qcMetricsClasses[d.code.toLowerCase()]}>
                {d.title}
              </Text>
            ))}
          </Space>
        }
      >
        <Tag
          color={qcMetricsClasses[qcEvaluation.toLowerCase()]}
          className="qc-evaluation-tag"
        >
          {qcEvaluation}
        </Tag>
      </Popover>
    ) : null;

    let colorMarkers = { ...msiLabels };

    orderListViewFilters.forEach((d) => {
      let plot = plots.find((e) => e.id === d.attribute);
      let markValue = getNestedValue(metadata, d.attribute);
      colorMarkers[`${d.attribute}`] =
        markValue != null
          ? getColorMarker(markValue, plot?.q1, plot?.q3)
          : "gray";
    });

    const createTooltip = (translationKey, valueKey, formatString = "20") => {
      const value = valueKey
        .split(".")
        .reduce((acc, key) => acc?.[key], metadata);
      return value !== undefined ? (
        <span
          dangerouslySetInnerHTML={{
            __html: t(translationKey, {
              count: value,
              value: isNaN(value) ? value : d3.format(formatString)(value),
            }),
          }}
        />
      ) : null;
    };
    let tooltips = {
      tumor_median_coverage: (
        <Space direction="vertical" size="small">
          {createTooltip(
            "metadata.m_reads_mapped",
            "coverage_qc.m_reads_mapped"
          )}
          {createTooltip("metadata.m_reads", "coverage_qc.m_reads")}
          {createTooltip(
            "metadata.percent_duplication",
            "coverage_qc.percent_duplication",
            ".2%"
          )}
          {createTooltip(
            "metadata.percent_optical_dups_of_dups",
            "coverage_qc.percent_optical_dups_of_dups",
            ".2%"
          )}
          {coverageQCFields().map((field, index) => {
            const tooltip = createTooltip(
              `metadata.${field.variable}`,
              `coverage_qc.${field.variable}`,
              field.format
            );
            return tooltip ? <span key={field}>{tooltip}</span> : null;
          })}
        </Space>
      ),
      sv_count: (
        <Space direction="vertical" size="small">
          {createTooltip("metadata.junction_count", "junction_count")}
          {createTooltip("metadata.loose_count", "loose_count")}
          {sv_countFields.map((field, index) => {
            const tooltip = createTooltip(
              `metadata.${field}_count`,
              `sv_types_count.${field}`,
              valueFormat(field)
            );
            return tooltip ? <span key={field}>{tooltip}</span> : null;
          })}
        </Space>
      ),
      "hrd.b1_2_score": (
        <span>
          {hrdFields
            .filter(
              (field, index) =>
                getNestedValue(metadata, `hrd.${field}`) !== null
            )
            .map((field, index) => {
              const tooltip = createTooltip(
                `metadata.hrd.${field}`,
                `hrd.${field}`,
                valueFormat(`hrd.${field}`)
              );
              let divider = hrdDividers[`hrd.${field}`] ? (
                <Divider orientation="left" plain className="tooltip-divider">
                  <span
                    dangerouslySetInnerHTML={{
                      __html: t(`metadata.hrd.${hrdDividers[`hrd.${field}`]}`),
                    }}
                  />
                </Divider>
              ) : null;
              return tooltip ? (
                <span className="hrd-tooltip" key={field}>
                  {divider}
                  <span key={field}>{tooltip}</span>
                </span>
              ) : null;
            })}
        </span>
      ),
      "msisensor.label": (
        <Space direction="vertical" size="small">
          {msiFields
            .filter(
              (field, index) =>
                getNestedValue(metadata, `msisensor.${field}`) !== null
            )
            .map((field, index) => {
              const tooltip = createTooltip(
                `metadata.msisensor.${field}`,
                `msisensor.${field}`,
                valueFormat(`msisensor.${field}`)
              );
              return tooltip ? <span key={field}>{tooltip}</span> : null;
            })}
        </Space>
      ),
      snv_count: createTooltip(
        "metadata.snv_count_normal_vaf_greater0",
        "snv_count_normal_vaf_greater0"
      ),
    };

    tooltips = Object.entries(tooltips)
      .filter(
        ([key, value]) =>
          value?.props?.children
            ?.flat()
            .filter((item) => item !== null && item.type !== "br").length > 0
      )
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});

    return (
      <Wrapper>
        <PageHeader
          className="site-page-header"
          title={
            <Space size="small" wrap>
              {this.renderTitle()}
            </Space>
          }
          subTitle={
            <Space size="small">
              <span>{inferred_sex}</span> {qcMetricsComponent}
              <Tooltip
                title={t("components.header-panel.cbioportal-button") || "cBioPortal"}
                placement="bottom"
                color="#27496b"
              >
                <Button
                  type="text"
                  className="header-badge-button"
                  onClick={this.handleCbioportalModalOpen}
                  aria-label={
                    t("components.header-panel.cbioportal-button") || "cBioPortal"
                  }
                >
                  <img
                    src={cbioportalIcon}
                    alt=""
                    className="header-badge-image"
                  />
                </Button>
              </Tooltip>
              <Tooltip
                title={
                  t("components.header-panel.clinical-trials-button") ||
                  "Clinical Trials"
                }
                placement="bottom"
                color="#27496b"
              >
                <Button
                  type="text"
                  className="header-badge-button"
                  onClick={this.handleClinicalTrialsModalOpen}
                  aria-label={
                    t("components.header-panel.clinical-trials-button") ||
                    "Clinical Trials"
                  }
                >
                  <img
                    src={ctgovLogo}
                    alt=""
                    className="header-badge-image"
                  />
                </Button>
              </Tooltip>
              <ReportButtonsPanel />
            </Space>
          }
          extra={
            <Space size={[0, 4]} wrap>
              <Tag color={legendColors()[0]}>{t("metadata.tags.tag1")}</Tag>
              <Tag color={legendColors()[1]}>{t("metadata.tags.tag2")}</Tag>
              <Tag color={legendColors()[2]}>{t("metadata.tags.tag3")}</Tag>
            </Space>
          }
        >
          <div className="ant-pro-page-container-detail">
            <div className="ant-pro-page-container-main">
              <div className="ant-pro-page-container-row">
                <div className="ant-pro-page-container-content">
                  <div className="page-header-content">
                    <div className="avatar-content0">
                      <Space direction="vertical" size="small">
                        <Space>
                          {tumor_type ? (
                            <Avatar
                              size="large"
                              style={{
                                backgroundColor: "#fde3cf",
                                color: "#f56a00",
                              }}
                            >
                              {tumor_type}
                            </Avatar>
                          ) : null}
                          <Space direction="vertical" size="10">
                            <Space direction="horizontal" size="small">
                              {disease}
                              {primary_site}
                              {tumor_details}
                            </Space>
                            {[
                              treatment,
                              treatment_type,
                              treatment_best_response,
                              treatment_duration,
                            ].some((item) => item != null) && (
                              <Space>
                                <Text type="secondary">
                                  {t("metadata.treatment")}:{" "}
                                </Text>
                                {treatment}
                                <Text type="secondary">
                                  {t("metadata.treatment_type")}:{" "}
                                </Text>
                                {treatment_type}
                                <Text type="secondary">
                                  {t("metadata.treatment_best_response")}:{" "}
                                </Text>
                                {treatment_best_response}
                                <Text type="secondary">
                                  {t("metadata.treatment_duration")}:{" "}
                                </Text>
                                {treatment_duration}
                              </Space>
                            )}
                          </Space>
                        </Space>
                      </Space>
                    </div>
                  </div>
                </div>
                <div className="ant-pro-page-container-extraContent">
                  <div className="extra-content">
                    {headerList
                      .filter(
                        (d) =>
                          !(
                            getNestedValue(metadata, d) === null ||
                            getNestedValue(metadata, d) === undefined ||
                            getNestedValue(metadata, d) === ""
                          )
                      )
                      .map((d) => (
                        <Tooltip
                          key={`components.header-panel.metadata.${d}.short`}
                          title={tooltips[d]}
                        >
                          <div className="stat-item">
                            <div className="ant-statistic">
                              <div
                                className={`ant-statistic-title ${
                                  tooltips[d] ? "has-tooltip" : ""
                                }`}
                              >
                                {t(
                                  `components.header-panel.metadata.${d}.short`
                                )}
                              </div>
                              <div className="ant-statistic-content">
                                <span className="ant-statistic-content-value">
                                  <span
                                    className="ant-statistic-content-value-int"
                                    style={{
                                      color: isNaN(getNestedValue(metadata, d))
                                        ? colorMarkers[
                                            getNestedValue(metadata, d)
                                          ]
                                        : colorMarkers[d],
                                    }}
                                  >
                                    {d === "tumor_median_coverage"
                                      ? `${
                                          metadata["tumor_median_coverage"] !=
                                          null
                                            ? `${metadata["tumor_median_coverage"]}X`
                                            : t("general.not-applicable")
                                        } / ${
                                          metadata["normal_median_coverage"] !=
                                          null
                                            ? `${metadata["normal_median_coverage"]}X`
                                            : t("general.not-applicable")
                                        }`
                                      : getNestedValue(metadata, d) != null
                                      ? isNaN(getNestedValue(metadata, d))
                                        ? getNestedValue(metadata, d)
                                        : d3.format(valueFormat(d))(
                                            getNestedValue(metadata, d)
                                          )
                                      : t("general.not-applicable")}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </Tooltip>
                      ))}

                    <div className="stat-item">
                      <div className="ant-statistic">
                        <div className="ant-statistic-title">
                          {t("components.header-panel.purity-ploidy-title")}
                        </div>
                        <div className="ant-statistic-content">
                          <span className="ant-statistic-content-value">
                            <span
                              className="ant-statistic-content-value-int"
                              style={{
                                color: colorMarkers["purity"],
                              }}
                            >
                              {purity != null
                                ? d3.format(valueFormat("purity"))(+purity)
                                : t("general.not-applicable")}
                            </span>
                          </span>
                          <span className="ant-statistic-content-suffix">
                            {" "}
                            <span className="purity-ploidy-separator">
                              /
                            </span>{" "}
                            <span
                              style={{
                                color: colorMarkers["ploidy"],
                              }}
                            >
                              {ploidy != null
                                ? d3.format(valueFormat("ploidy"))(+ploidy)
                                : t("general.not-applicable")}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PageHeader>
        <CbioportalModal
          visible={this.state.cbioportalModalVisible}
          onCancel={this.handleCbioportalModalClose}
          loading={this.props.loading}
        />
        <ClinicalTrialsModal
          visible={this.state.clinicalTrialsModalVisible}
          onCancel={this.handleClinicalTrialsModalClose}
        />
      </Wrapper>
    );
  }
}
HeaderPanel.propTypes = {
  canReturnToResults: PropTypes.bool,
  onBackToResults: PropTypes.func,
  selectedCase: PropTypes.object,
};
HeaderPanel.defaultProps = {
  canReturnToResults: false,
  onBackToResults: null,
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  report: state.CaseReport.id,
  dataset: state.Settings.dataset,
  metadata: state.CaseReport.metadata,
  plots: state.PopulationStatistics.general,
  loading: state.FilteredEvents?.loading || false,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(HeaderPanel));
