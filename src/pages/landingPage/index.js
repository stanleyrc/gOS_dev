import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { ScrollToHOC } from "react-scroll-to";
import { Spin, Progress } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import Wrapper from "./index.style";
import ListView from "../../containers/listView";
import caseReportsActions from "../../redux/caseReports/actions";
import datasetsActions from "../../redux/datasets/actions";
import {
  buildCaseReportUrl,
  getSourceCaseIdentity,
  resolveBrowseDataset,
} from "../../helpers/browseScope";

const { searchCaseReports } = caseReportsActions;
const { openCaseReport } = datasetsActions;

const twoColors = { "0%": "#108ee9", "100%": "#87d068" };

export class LandingPage extends Component {
  handleCardClick = (event, report) => {
    const identity = getSourceCaseIdentity(report);
    event.stopPropagation();
    if (!identity) return;

    if (event.metaKey || event.ctrlKey) {
      const url = buildCaseReportUrl(
        document.location,
        identity,
        this.props.browseScope,
      );
      const newWindow = window.open(
        url.toString(),
        "_blank",
        "noopener,noreferrer",
      );
      if (newWindow) newWindow.opener = null;
    } else {
      this.props.openCaseReport(identity.datasetId, identity.caseReportId);
    }
  };

  render() {
    const {
      loading,
      loadingPercentage,
      reports,
      totalReportsCount,
      reportsFilters,
      reportsFiltersExtents,
      searchCaseReports,
      searchFilters,
      datafiles,
      dataset,
    } = this.props;

    return (
      <Wrapper>
        {loading && (
          <div className="loading-container">
            {loadingPercentage !== Infinity ? (
              <Progress
                type="circle"
                percent={loadingPercentage}
                strokeColor={twoColors}
              />
            ) : (
              <Spin
                indicator={<LoadingOutlined style={{ fontSize: 16 }} spin />}
              />
            )}
          </div>
        )}
        {!loading && (
          <ListView
            records={reports}
            handleCardClick={this.handleCardClick}
            filters={reportsFilters}
            filtersExtents={reportsFiltersExtents}
            onSearch={searchCaseReports}
            searchFilters={searchFilters}
            totalRecords={totalReportsCount}
            datafiles={datafiles}
            dataset={dataset}
          />
        )}
      </Wrapper>
    );
  }
}

const mapDispatchToProps = (dispatch) => ({
  searchCaseReports: (filters) => dispatch(searchCaseReports(filters)),
  openCaseReport: (datasetId, caseReportId) =>
    dispatch(openCaseReport(datasetId, caseReportId)),
});

const mapStateToProps = (state) => ({
  loading: state.CaseReports.loading,
  loadingPercentage: state.CaseReports.loadingPercentage,
  reports: state.CaseReports.reports,
  reportsFilters: state.CaseReports.reportsFilters,
  reportsFiltersExtents: state.CaseReports.reportsFiltersExtents,
  searchFilters: state.CaseReports.searchFilters,
  totalReportsCount: state.CaseReports.totalReports.length,
  datafiles: state.CaseReports.datafiles,
  browseScope: state.Settings.browseScope,
  dataset: resolveBrowseDataset(state),
});

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(withRouter(withTranslation("common")(ScrollToHOC(LandingPage))));
