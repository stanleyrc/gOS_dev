import React, { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { withTranslation } from "react-i18next";
import { Layout, Space, Spin, Select, Avatar, Progress, Typography } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import TopbarWrapper from "./topbar.style";
import SignInButton from "./signInButton";
import { siteConfig } from "../../settings";
import logo from "../../assets/images/logo.png";
import caseReportsActions from "../../redux/caseReports/actions";
import settingsActions from "../../redux/settings/actions";
import datasetsActions from "../../redux/datasets/actions";
import {
  ALL_DATASETS_SCOPE_VALUE,
  datasetHasField,
  distinctCaseRecords,
  getSourceCaseIdentity,
  getSourceScopedFieldValue,
  hasBrowseScope,
  isAllDatasetsBrowseScope,
  resolveBrowseDataset,
  sourceCaseIdentityKey,
  sourceDatasetHasField,
} from "../../helpers/browseScope";

const { Header } = Layout;
const { Option } = Select;
const { Text } = Typography;

const { searchCaseReports } = caseReportsActions;
const { updateCaseReport } = settingsActions;
const { openCaseReport, selectAllDatasets, selectDataset } = datasetsActions;

export class Topbar extends Component {
  state = { dropdownOpen: false };

  reportHasField = (report, field) =>
    datasetHasField(this.props.browseDataset, field) &&
    sourceDatasetHasField(
      report,
      this.props.datasets,
      field,
      this.props.browseDataset,
    );

  reportFieldValue = (report, field) =>
    this.reportHasField(report, field)
      ? getSourceScopedFieldValue(
          report,
          this.props.datasets,
          field,
          this.props.browseDataset,
        )
      : undefined;

  getSelectedBrowseScopeValue = () =>
    isAllDatasetsBrowseScope(this.props.browseScope)
      ? ALL_DATASETS_SCOPE_VALUE
      : this.props.browseScope?.datasetId || this.props.dataset?.id;

  handleDatasetSelect = (datasetId) => {
    if (datasetId === ALL_DATASETS_SCOPE_VALUE) {
      this.props.selectAllDatasets();
    } else {
      this.props.selectDataset(datasetId);
    }
  };

  getDatasetCaseCount = (dataset) => {
    const cachedRecords = this.props.manifestRecordsByDataset?.[dataset.id];
    if (Array.isArray(cachedRecords)) {
      return cachedRecords.filter((record) => record.visible !== false).length;
    }
    const configuredCount = Number(dataset.caseReportsCount);
    return Number.isFinite(configuredCount) ? configuredCount : null;
  };

  getAllDatasetsCaseCount = () => {
    const cachedRecordLists = this.props.datasets.map(
      (dataset) => this.props.manifestRecordsByDataset?.[dataset.id],
    );
    if (cachedRecordLists.every(Array.isArray)) {
      return distinctCaseRecords(cachedRecordLists.flat()).filter(
        (record) => record.visible !== false,
      ).length;
    }

    const counts = this.props.datasets.map((dataset) =>
      this.getDatasetCaseCount(dataset),
    );
    return counts.every((count) => count != null)
      ? counts.reduce((total, count) => total + count, 0)
      : null;
  };

  getReportOptionValue = (report) => sourceCaseIdentityKey(report);

  handleReportSelect = (optionValue) => {
    const report = this.props.reports.find(
      (candidate) => this.getReportOptionValue(candidate) === optionValue,
    );
    const identity = getSourceCaseIdentity(report);
    if (identity) {
      this.props.openCaseReport(identity.datasetId, identity.caseReportId);
    }
  };

  handleLogoClick = () => {
    if (this.props.report) {
      this.props.updateCaseReport(null);
      return;
    }
    this.props.searchCaseReports(this.props.searchFilters);
  };

  render() {
    const {
      t,
      loading,
      reports,
      totalReportsCount,
      searchCaseReports,
      searchFilters,
      datasets,
      browseScope,
      loadingDatasets,
      loadingPercentage,
    } = this.props;
    const hasSelectedBrowseScope = hasBrowseScope(browseScope);

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
                    onClick={this.handleLogoClick}
                  >
                    <img src={logo} alt="logo" />
                    <h1>{siteConfig.siteName}</h1>
                  </div>
                  <Select
                    className="datasets-select"
                    loading={loadingDatasets}
                    value={this.getSelectedBrowseScopeValue()}
                    placeholder={t("topbar.select-dataset")}
                    variant="borderless"
                    optionLabelProp="label"
                    popupMatchSelectWidth={false}
                    onSelect={this.handleDatasetSelect}
                  >
                    <Option
                      key={ALL_DATASETS_SCOPE_VALUE}
                      value={ALL_DATASETS_SCOPE_VALUE}
                      label={t("topbar.all-accessible-datasets")}
                    >
                      <Space>
                        <Text strong>{t("topbar.all-accessible-datasets")}</Text>
                        {this.getAllDatasetsCaseCount() != null ? (
                          <Text type="secondary">
                            {t("topbar.dataset-cases", {
                              count: this.getAllDatasetsCaseCount(),
                            })}
                          </Text>
                        ) : null}
                      </Space>
                    </Option>
                    {datasets.map((dataset) => (
                      <Option
                        key={dataset.id}
                        value={dataset.id}
                        label={dataset.title}
                      >
                        <Space>
                          <span>{dataset.title}</span>
                          {this.getDatasetCaseCount(dataset) != null ? (
                            <Text type="secondary">
                              {t("topbar.dataset-cases", {
                                count: this.getDatasetCaseCount(dataset),
                              })}
                            </Text>
                          ) : null}
                        </Space>
                      </Option>
                    ))}
                  </Select>
                  <Select
                    showSearch
                    value={searchFilters.texts}
                    className="reports-select"
                    allowClear
                    disabled={!hasSelectedBrowseScope}
                    loading={loading}
                    optionLabelProp="label"
                    popupMatchSelectWidth={false}
                    optionFilterProp="children"
                    placeholder={t("topbar.browse-case-reports")}
                    searchValue={searchFilters.texts}
                    onDropdownVisibleChange={(open) =>
                      this.setState({ dropdownOpen: open })
                    }
                    onSearch={(texts) => {
                      const trimmedTexts = (texts || "").trim();
                      if (this.state.dropdownOpen || trimmedTexts !== "") {
                        searchCaseReports({
                          ...searchFilters,
                          texts: trimmedTexts,
                        });
                      }
                    }}
                    filterOption={false}
                    filterSort={false}
                    notFoundContent={null}
                    autoClearSearchValue={false}
                    onSelect={this.handleReportSelect}
                    onClear={() =>
                      searchCaseReports({ ...searchFilters, texts: "" })
                    }
                  >
                    {reports.map((report) => (
                      <Option
                        key={this.getReportOptionValue(report)}
                        value={this.getReportOptionValue(report)}
                        label={report.pair}
                      >
                        <div className="demo-option-label-item">
                          <Space>
                            {this.reportFieldValue(
                              report,
                              "tumor_type",
                            ) != null && (
                              <Avatar
                                size="small"
                                style={{
                                  backgroundColor: "#fde3cf",
                                  color: "#f56a00",
                                }}
                              >
                                {this.reportFieldValue(
                                  report,
                                  "tumor_type",
                                )}
                              </Avatar>
                            )}
                            {report.pair}
                            {isAllDatasetsBrowseScope(browseScope) ? (
                              <Text type="secondary">
                                {report.sourceDatasetTitle || report.datasetId}
                              </Text>
                            ) : null}
                            {this.reportFieldValue(
                              report,
                              "inferred_sex",
                            )}
                          </Space>
                        </div>
                      </Option>
                    ))}
                  </Select>
                  {loading ? (
                    <Spin
                      indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />}
                    />
                  ) : hasSelectedBrowseScope ? (
                    <Space>
                      <span
                        dangerouslySetInnerHTML={{
                          __html: t("topbar.report", {
                            count: totalReportsCount,
                          }),
                        }}
                      />
                    </Space>
                  ) : null}
                </Space>
              </div>
              <div className="ant-pro-top-nav-header-menu" />
              <div className="ant-pro-top-nav-header-main-right">
                <div className="ant-pro-top-nav-header-main-right-container">
                  <Space>
                    <div className="ant-pro-loader-container">
                      {loading &&
                        (loadingPercentage !== Infinity ? (
                          <Progress
                            type="circle"
                            percent={loadingPercentage}
                            size={20}
                          />
                        ) : (
                          <Spin
                            indicator={
                              <LoadingOutlined style={{ fontSize: 16 }} spin />
                            }
                          />
                        ))}
                    </div>
                    <SignInButton />
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

const mapDispatchToProps = (dispatch) => ({
  updateCaseReport: (report) => dispatch(updateCaseReport(report)),
  selectDataset: (datasetId) => dispatch(selectDataset(datasetId)),
  selectAllDatasets: () => dispatch(selectAllDatasets()),
  openCaseReport: (datasetId, caseReportId) =>
    dispatch(openCaseReport(datasetId, caseReportId)),
  searchCaseReports: (filters) => dispatch(searchCaseReports(filters)),
});

const mapStateToProps = (state) => ({
  loading: state.CaseReports.loading,
  loadingDatasets: state.Datasets.loading,
  dataset: state.Settings.dataset,
  browseDataset: resolveBrowseDataset(state),
  browseScope: state.Settings.browseScope,
  datasets: state.Datasets.records,
  manifestRecordsByDataset: state.CaseReports.manifestRecordsByDataset,
  report: state.Settings.report,
  reports: state.CaseReports.reports,
  searchFilters: state.CaseReports.searchFilters,
  loadingPercentage: state.CaseReports.loadingPercentage,
  totalReportsCount: state.CaseReports.totalReports.length,
});

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(withRouter(withTranslation("common")(Topbar)));
