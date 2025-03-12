import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import {
  Space,
  PageHeader,
  Tag,
  Avatar,
  Tooltip,
  Popover,
  Typography,
  Divider,
} from "antd";
import * as d3 from "d3";
import {
  legendColors,
  qualityStatusTagClasses,
  qualityStatusTypographyClasses,
  coverageQCFields,
  plotTypes,
} from "../../helpers/utility";
import {
  valueFormat,
  hrdFields,
  svCountFields,
  headerList,
  msiFields,
  hrdDividers,
  msiLabels,
} from "../../helpers/metadata";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import Wrapper from "./index.style";

const { Text, Link } = Typography;

class HeaderPanel extends Component {
  render() {
    const {
      t,
      report,
      metadata,
      plots,
      qualityStatus,
      dataset,
      qualityReportPresent,
      qualityReportName,
    } = this.props;
    if (!report) return null;
    const { tumor, purity, ploidy, pair, sex, disease, primary_site } =
      metadata;

    let colorMarkers = { ...msiLabels };

    Object.keys(plotTypes()).forEach((d) => {
      let plot = plots.find((e) => e.id === d);
      let markValue = metadata[d];
      colorMarkers[d] = markValue
        ? markValue < plot?.q1
          ? legendColors()[0]
          : markValue > plot?.q3
          ? legendColors()[2]
          : legendColors()[1]
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
      svCount: (
        <Space direction="vertical" size="small">
          {createTooltip("metadata.junction_count", "junction_count")}
          {createTooltip("metadata.loose_count", "loose_count")}
          {svCountFields.map((field, index) => {
            const tooltip = createTooltip(
              `metadata.${field}_count`,
              `sv_types_count.${field}`,
              valueFormat(field)
            );
            return tooltip ? <span key={field}>{tooltip}</span> : null;
          })}
        </Space>
      ),
      hrdB12Score: (
        <span>
          {hrdFields
            .filter((field, index) =>
              `hrd.${field}`
                .split(".")
                .reduce((acc, key) => acc?.[key], metadata)
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
      msiLabel: (
        <Space direction="vertical" size="small">
          {msiFields
            .filter((field, index) =>
              `msisensor.${field}`
                .split(".")
                .reduce((acc, key) => acc?.[key], metadata)
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
      snvCount: createTooltip(
        "metadata.snv_count_normal_vaf_greater0",
        "snv_count_normal_vaf_greater0"
      ),
    };
    const qualityStatusIcons = {
      0: <CheckCircleOutlined />,
      1: <ExclamationCircleOutlined />,
      2: <CloseCircleOutlined />,
      3: <QuestionCircleOutlined />,
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
              {sex}
              {qualityStatus.level > 0 && (
                <Popover
                  placement="bottomLeft"
                  title={
                    <>
                      <Space>
                        <Text>{t(`quality-status.title`)}:</Text>
                        <Text
                          type={
                            qualityStatusTypographyClasses()[
                              qualityStatus.level
                            ]
                          }
                        >
                          <strong>
                            {t(
                              `quality-status.level.${qualityStatus.level}.adjective`
                            )}
                          </strong>
                        </Text>
                      </Space>
                      <Link
                        disabled={!qualityReportPresent}
                        className="quality-report-link"
                        style={{ float: "right" }}
                        href={`${dataset.dataPath}${report}/${qualityReportName}`}
                        target="_blank"
                      >
                        {t(`components.header-panel.view-report`)}
                      </Link>
                    </>
                  }
                  content={
                    <Space direction="vertical">
                      {qualityStatus.clauses.map((d) => (
                        <Text type={qualityStatusTypographyClasses()[d.level]}>
                          <span
                            dangerouslySetInnerHTML={{
                              __html: t(
                                `quality-status.assessment.${d.label}`,
                                {
                                  value: d3.format(d.format)(eval(d.variable)),
                                }
                              ),
                            }}
                          />
                        </Text>
                      ))}
                    </Space>
                  }
                  trigger="hover"
                >
                  <Tag
                    icon={qualityStatusIcons[qualityStatus.level]}
                    color={qualityStatusTagClasses()[qualityStatus.level]}
                  >
                    {t(`quality-status.level.${qualityStatus.level}.noun`)}
                  </Tag>
                </Popover>
              )}
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
                      <Space>
                        <Avatar
                          size="large"
                          style={{
                            backgroundColor: "#fde3cf",
                            color: "#f56a00",
                          }}
                        >
                          {tumor}
                        </Avatar>
                        {disease}
                        {primary_site}
                      </Space>
                    </div>
                  </div>
                </div>
                <div className="ant-pro-page-container-extraContent">
                  <div className="extra-content">
                    {headerList.map((d) => (
                      <Tooltip key={`metadata.${d}.short`} title={tooltips[d]}>
                        <div className="stat-item">
                          <div className="ant-statistic">
                            <div
                              className={`ant-statistic-title ${
                                tooltips[d] ? "has-tooltip" : ""
                              }`}
                            >
                              {t(`metadata.${d}.short`)}
                            </div>
                            <div className="ant-statistic-content">
                              <span className="ant-statistic-content-value">
                                <span
                                  className="ant-statistic-content-value-int"
                                  style={{
                                    color: isNaN(metadata[d])
                                      ? colorMarkers[metadata[d]]
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
                                    : metadata[d] != null
                                    ? isNaN(metadata[d])
                                      ? metadata[d]
                                      : d3.format(valueFormat(d))(metadata[d])
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
                          {t("metadata.purity-ploidy-title")}
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
  qualityStatus: state.CaseReport.qualityStatus,
  qualityReportPresent: state.CaseReport.qualityReportPresent,
  qualityReportName: state.CaseReport.qualityReportName,
  dataset: state.Settings.dataset,
  metadata: state.CaseReport.metadata,
  plots: state.App.populationMetrics,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(HeaderPanel));
