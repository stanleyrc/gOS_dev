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
import appActions from "../../redux/app/actions";

const {} = appActions;

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
        markValue < plot.q1
          ? legendColors()[0]
          : markValue > plot.q3
          ? legendColors()[2]
          : legendColors()[1];
    });
    const tooltips = {
      svCount: (
        <span>
          <span
            dangerouslySetInnerHTML={{
              __html: t("metadata.junction_count", {
                count: +metadata.junction_count,
              }),
            }}
          />
          <br />
          <span
            dangerouslySetInnerHTML={{
              __html: t("metadata.loose_count", {
                count: +metadata.loose_count,
              }),
            }}
          />
        </span>
      ),
      snvCount: (
        <span
          dangerouslySetInnerHTML={{
            __html: t("metadata.snv_count_normal_vaf_greater0", {
              count: +metadata.snv_count_normal_vaf_greater0,
            }),
          }}
        />
      ),
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
                      "coverageVariance",
                      "snvCount",
                      "svCount",
                      "tmb",
                      "lohFraction",
                    ].map((d) => (
                      <Tooltip title={tooltips[d]}>
                        <div className="stat-item">
                          <div className="ant-statistic">
                            <div
                              className={`ant-statistic-title ${
                                tooltips[d] ? "has-tooltip" : ''
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
                                  {d3.format(plotTypes()[d].format)(
                                    +metadata[d]
                                  )}
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
  report: state.App.report,
  metadata: state.App.metadata,
  plots: state.App.populationMetrics,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(HeaderPanel));
