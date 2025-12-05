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
import { get } from "immutable";

const { Text } = Typography;

class HeaderPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      cbioportalModalVisible: false,
    };
  }

  handleCbioportalModalOpen = () => {
    this.setState({ cbioportalModalVisible: true });
  };

  handleCbioportalModalClose = () => {
    this.setState({ cbioportalModalVisible: false });
  };

  render() {
    const { t, report, metadata, plots } = this.props;
    if (!report) return null;
    const {
      tumor_type,
      purity,
      ploidy,
      pair,
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
          title={pair}
          subTitle={
            <Space>
              <span>{inferred_sex}</span> {qcMetricsComponent}
              <Button
                type="text"
                onClick={this.handleCbioportalModalOpen}
                title={t("components.header-panel.cbioportal-button") || "cBioPortal"}
                style={{
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={cbioportalIcon}
                  alt="cBioPortal"
                  title={t("components.header-panel.cbioportal-button") || "cBioPortal"}
                  style={{
                    height: "32px",
                    width: "32px",
                    filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15))",
                    cursor: "pointer",
                  }}
                />
              </Button>
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
      </Wrapper>
    );
  }
}
HeaderPanel.propTypes = {
  selectedCase: PropTypes.object,
};
HeaderPanel.defaultProps = {};
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
