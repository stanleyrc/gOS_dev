import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Space, message, PageHeader, Tag, Avatar, Tooltip } from "antd";
import * as d3 from "d3";
import {
  downloadCanvasAsPng,
  legendColors,
  plotTypes,
} from "../../helpers/utility";
import html2canvas from "html2canvas";
import Wrapper from "./index.style";

class HeaderPanel extends Component {
  onDownloadButtonClicked = () => {
    html2canvas(document.body)
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.selectedFiles
            .map((d) => d.file)
            .join("_")
            .replace(/\s+/g, "_")
            .toLowerCase()}.png`
        );
      })
      .catch((error) => {
        message.error(this.props.t("general.error", { error }));
      });
  };

  render() {
    const { t, report, metadata, plots } = this.props;
    if (!report) return null;
    const { tumor, purity, ploidy, pair, sex, disease, primary_site } =
      metadata;

    let colorMarkers = {};
    Object.keys(plotTypes()).forEach((d) => {
      let plot = plots.find((e) => e.id === d);
      let markValue = metadata[d];
      colorMarkers[d] =
        markValue < plot?.q1
          ? legendColors()[0]
          : markValue > plot?.q3
          ? legendColors()[2]
          : legendColors()[1];
    });
        

    const createTooltip = (translationKey, valueKey, formatString="20") => {
      const value = valueKey.split('.').reduce((acc, key) => acc?.[key], metadata);
      return value !== undefined ? (
        <span
          dangerouslySetInnerHTML={{
            __html: t(translationKey, {
              count: typeof value === 'string' ? value : d3.format(formatString)(value),
            }),
          }}
        />
      ) : null;
    };

    const svCountFields = [
      "tyfonas",
      "dm",
      "bfb",
      "cpxdm",
      "chromothripsis",
      "chromoplexy",
      "tic",
      "rigma",
      "pyrgo",
      "del",
      "dup",
      "simple",
      "DEL-like",
      "DUP-like",
      "INV-like",
      "TRA-like",
    ];

    const hrdFields = [
      "dels_mh",
      "del_rep",
      "rs3",
      "rs5",
      "sbs3",
      "sbs8",
      "qrppos",
      "qrpmin",
      "qrpmix",
    ]

    const coverageQCFields = [
      "%_reads_mapped",
      "%_gc",
      "≥_30x",
      "≥_50x",
      "insert_size",
      "%_mapq_0_reads",
      "coverage_variance",
    ]

    const tooltips = {
      tumor_median_coverage: (
        <span>
          {createTooltip("metadata.m_reads_mapped", "coverage_qc.m_reads_mapped")}
          <br />
          {createTooltip("metadata.m_reads", "coverage_qc.m_reads")}
          <br />
          {createTooltip("metadata.percent_duplication", "coverage_qc.percent_duplication", ".2%")}
          {createTooltip("metadata.percent_optical_dups_of_dups", "coverage_qc.percent_optical_dups_of_dups", ".2%")}
          <br />
          {coverageQCFields.map((field, index) => {
            const tooltip = createTooltip(`metadata.${field}`, `coverage_qc.${field}`, ".1%");
            return tooltip ? (
              <span key={field}>
                {tooltip}
                {index < coverageQCFields.length - 1 && <br />}
              </span>
            ) : null;
          })}
        </span>
      ),
      svCount: (
        <span>
          {createTooltip("metadata.junction_count", "junction_count")}
          <br />
          {createTooltip("metadata.loose_count", "loose_count")}
          <br />
          {svCountFields.map((field, index) => {
            const tooltip = createTooltip(`metadata.${field}_count`, `sv_types_count.${field}`);
            return tooltip ? (
              <span key={field}>
                {tooltip}
                {index < svCountFields.length - 1 && <br />}
              </span>
            ) : null;
          })}
        </span>
      ),
      hrdScore: (
        <span>
          {hrdFields.map((field, index) => {
            const tooltip = createTooltip(`metadata.${field}`, `hrd.${field}`);
            return tooltip ? (
              <span key={field}>
                {tooltip}
                {index < hrdFields.length - 1 && <br />}
              </span>
            ) : null;
          })}
        </span>
      ),
      snvCount: createTooltip("metadata.snv_count_normal_vaf_greater0", "snv_count_normal_vaf_greater0"),
    };
    return (
      <Wrapper>
        <PageHeader
          className="site-page-header"
          title={pair}
          subTitle={sex}
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
                    {[
                      "tumor_median_coverage",
                      "snvCount",
                      "svCount",
                      "hrdScore",
                      "tmb",
                      "lohFraction",
                    ].map((d) => (
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
                                    color: colorMarkers[d],
                                  }}
                                >
                                  { 
                                      d === "tumor_median_coverage" ? `${metadata["tumor_median_coverage"]} / ${metadata["normal_median_coverage"]}` :
                                      d3.format(plotTypes()[d].format)( +metadata[d])
                                    }
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
                              {d3.format(plotTypes()["purity"].format)(+purity)}
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
                              {d3.format(plotTypes()["ploidy"].format)(+ploidy)}
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
  metadata: state.CaseReport.metadata,
  plots: state.App.populationMetrics,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(HeaderPanel));
