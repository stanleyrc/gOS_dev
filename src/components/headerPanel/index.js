import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import {
  Space,
  Button,
  Tooltip,
  message,
  Menu,
  Dropdown,
  PageHeader,
  Row,
  Avatar,
} from "antd";
import * as d3 from "d3";
import moment from "moment";
import { AiOutlineDownload, AiOutlineDown } from "react-icons/ai";
import { FaHome, FaPhoneAlt, FaIdCard } from "react-icons/fa";
import { downloadCanvasAsPng } from "../../helpers/utility";
import html2canvas from "html2canvas";
import avatarPlaceholder from "../../assets/images/avatar.png";
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
    const { t, selectedFiles } = this.props;
    if (selectedFiles.length < 1) return null;
    const { profile, file, metadata } = selectedFiles[0];
    const { firstName, lastName, avatar, birthdate, address, phone, ssn } =
      profile;
    const { purity, ploidy } = metadata;
    return (
      <Wrapper>
        <PageHeader className="site-page-header" title={file} extra={""}>
          <div className="ant-pro-page-container-detail">
            <div className="ant-pro-page-container-main">
              <div className="ant-pro-page-container-row">
                <div className="ant-pro-page-container-content">
                  <div className="page-header-content">
                    <div className="avatar-content">
                      <span className="ant-avatar ant-avatar-lg ant-avatar-circle ant-avatar-image">
                        <img
                          alt={`${firstName} ${lastName}`}
                          title={`${firstName} ${lastName}`}
                          src={
                            avatar
                              ? `data/${file}/${avatar}`
                              : avatarPlaceholder
                          }
                        />
                      </span>
                    </div>
                    <div className="content-patient">
                      <div className="content-patient-title">
                        <Space align="center" size="middle">
                          <span className="content-patient-title">
                            {firstName} {lastName}
                          </span>
                          <span className="ant-page-header-heading-sub-title">
                            {moment().diff(birthdate, "years")}
                          </span>
                        </Space>
                      </div>
                      <div>
                        <Space align="baseline">
                          <FaHome />
                          {address}
                          <FaPhoneAlt />
                          {phone}
                          <FaIdCard />
                          {ssn}
                        </Space>
                      </div>
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
                              <span className="ant-statistic-content-value-int">
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
                            <span className="ant-statistic-content-value-int">
                              {d3.format(".2f")(purity)}
                            </span>
                          </span>
                          <span className="ant-statistic-content-suffix">
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
  tags: state.App.tags,
  selectedFiles: state.App.selectedFiles,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(HeaderPanel));
