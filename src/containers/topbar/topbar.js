import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { Layout, Space, Spin, Select, Avatar } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import TopbarWrapper from "./topbar.style";
import { siteConfig } from "../../settings";
import logo from "../../assets/images/logo.png";
import appActions from "../../redux/app/actions";

const { Header } = Layout;
const { Option } = Select;

const { selectReport, resetReport, searchReports } = appActions;

class Topbar extends Component {
  render() {
    const {
      t,
      loading,
      reports,
      totalReports,
      selectReport,
      resetReport,
      searchReports,
      searchFilters,
    } = this.props;
    return (
      <TopbarWrapper>
        <Header className="ant-pro-top-menu">
          <div className="ant-pro-top-nav-header light">
            <div className="ant-pro-top-nav-header-main ">
              <div className="ant-pro-top-nav-header-main-left">
                <Space>
                  <div
                    className="ant-pro-top-nav-header-logo"
                    id="logo"
                    onClick={(e) => resetReport()}
                  >
                    <img src={logo} alt="logo" />
                    <h1>{siteConfig.siteName}</h1>
                  </div>
                  <Select
                    showSearch={true}
                    value={searchFilters.texts}
                    className="reports-select"
                    allowClear={true}
                    loading={loading}
                    showArrow={true}
                    optionLabelProp="value"
                    dropdownMatchSelectWidth={false}
                    optionFilterProp="children"
                    placeholder={t("topbar.browse-case-reports")}
                    onSearch={(texts) => searchReports({ texts })}
                    filterOption={false}
                    filterSort={false}
                    notFoundContent={null}
                    onSelect={(report) => {
                      selectReport(report);
                    }}
                    onClear={(e) => resetReport()}
                  >
                    {reports.map((d) => (
                      <Option key={d.pair} value={d.pair} label={d.pair}>
                        <div className="demo-option-label-item">
                          <Space>
                            <Avatar
                              size="small"
                              style={{
                                backgroundColor: "#fde3cf",
                                color: "#f56a00",
                              }}
                            >
                              {d.tumor_type}
                            </Avatar>
                            {d.pair}
                            {d.inferred_sex}
                          </Space>
                        </div>
                      </Option>
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
                              count: totalReports,
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
  resetReport: () => dispatch(resetReport()),
  searchReports: (texts) => dispatch(searchReports(texts)),
});
const mapStateToProps = (state) => ({
  loading: state.App.loading,
  report: state.App.report,
  reports: state.App.reports,
  totalReports: state.App.totalReports,
  searchText: state.App.searchText,
  searchFilters: state.App.searchFilters,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(Topbar));
