import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { Layout, Space, Spin, Select } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import TopbarWrapper from "./topbar.style";
import { siteConfig } from "../../settings";
import logo from "../../assets/images/logo.png";
import appActions from "../../redux/app/actions";

const { Header } = Layout;
const { Option } = Select;

const { selectReport } = appActions;

class Topbar extends Component {
  render() {
    const { t, loading, report, reports, selectReport } = this.props;
    return (
      <TopbarWrapper>
        <Header className="ant-pro-top-menu">
          <div className="ant-pro-top-nav-header light">
            <div className="ant-pro-top-nav-header-main ">
              <div className="ant-pro-top-nav-header-main-left">
                <Space>
                  <div className="ant-pro-top-nav-header-logo" id="logo">
                    <img src={logo} alt="logo" />
                    <h1>{siteConfig.siteName}</h1>
                  </div>
                  <Select
                    showSearch={true}
                    value={report}
                    className="reports-select"
                    allowClear={true}
                    loading={loading}
                    showArrow={true}
                    optionLabelProp="value"
                    dropdownMatchSelectWidth={false}
                    optionFilterProp="children"
                    placeholder={t("topbar.browse-case-reports")}
                    filterOption={(input, option) =>
                      option.key.toLowerCase().indexOf(input.toLowerCase()) >= 0
                    }
                    filterSort={(optionA, optionB) =>
                      optionA.key
                        .toLowerCase()
                        .localeCompare(optionB.key.toLowerCase())
                    }
                    onChange={(report) => {
                      selectReport(report);
                    }}
                  >
                    {reports.map((d) => (
                      <Option key={d} value={d} />
                    ))}
                  </Select>
                  {loading ? (
                    <Spin
                      indicator={
                        <LoadingOutlined style={{ fontSize: 16 }} spin />
                      }
                    />
                  ) : (
                    <Space>
                      {reports.length > 0 && (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: t("topbar.report", {
                              count: reports.length,
                            }),
                          }}
                        />
                      )}
                    </Space>
                  )}
                </Space>
              </div>
              <div className="ant-pro-top-nav-header-menu"></div>
              <div className="ant-pro-top-nav-header-main-right">
                <div className="ant-pro-top-nav-header-main-right-container">
                  <Space align="center">
                    <div className="ant-pro-loader-container">
                      {loading && (
                        <Spin
                          indicator={
                            <LoadingOutlined style={{ fontSize: 16 }} spin />
                          }
                        />
                      )}
                    </div>
                  </Space>
                </div>
              </div>
            </div>
          </div>
        </Header>
      </TopbarWrapper>
    );
  }
}
Topbar.propTypes = {
  selectedFiles: PropTypes.array,
};
Topbar.defaultProps = {
  currentPage: "",
};
const mapDispatchToProps = (dispatch) => ({
  selectReport: (report) => dispatch(selectReport(report)),
});
const mapStateToProps = (state) => ({
  loading: state.App.loading,
  report: state.App.report,
  reports: state.App.reports,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(Topbar));
