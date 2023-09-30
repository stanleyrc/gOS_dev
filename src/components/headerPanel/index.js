import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Space, message, PageHeader, Tag, Avatar } from "antd";
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
    const { tumor, purity, ploidy, pair } = metadata;

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

    return (
      <Wrapper>
        <PageHeader
          className="site-page-header"
          title={pair}
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
                      <Avatar
                        size="large"
                        style={{
                          backgroundColor: "#fde3cf",
                          color: "#f56a00",
                        }}
                      >
                        {tumor}
                      </Avatar>
                    </div>
                  </div>
                </div>
                <div className="ant-pro-page-container-extraContent">
                  <div className="extra-content">
                    {[
                      "coverageVariance",
                      "snvCount",
                      "svCount",
                      "lohFraction",
                    ].map((d) => (
                      <div className="stat-item">
                        <div className="ant-statistic">
                          <div className="ant-statistic-title">
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
                                {Number.isInteger(metadata[d])
                                  ? d3.format(",")(metadata[d])
                                  : d3.format(".2%")(metadata[d])}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
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
                              {d3.format(".2f")(purity)}
                            </span>
                          </span>
                          <span
                            className="ant-statistic-content-suffix"
                            style={{
                              color: colorMarkers["ploidy"],
                            }}
                          >
                            / {d3.format(".2f")(ploidy)}
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
