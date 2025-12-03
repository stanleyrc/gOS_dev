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
import settingsActions from "../../redux/settings/actions";

const { searchCaseReports } = caseReportsActions;
const { updateCaseReport } = settingsActions;

const twoColors = {
  "0%": "#108ee9",
  "100%": "#87d068",
};

class LandingPage extends Component {
  handleCardClick = (event, report) => {
    const { updateCaseReport } = this.props;
    event.stopPropagation();
    if (event.metaKey) {
      const newWindow = window.open(
        `/?report=${report}`,
        "_blank",
        "noopener,noreferrer"
      );
      if (newWindow) newWindow.opener = null;
    } else {
      updateCaseReport(report);
    }
  };

  render() {
    const {
      loading,
      loadingPercentage,
      reports,
      totalReports,
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
            totalRecords={totalReports}
            datafiles={datafiles}
            dataset={dataset}
          />
        )}
      </Wrapper>
    );
  }
}
LandingPage.propTypes = {};
LandingPage.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  searchCaseReports: (filters) => dispatch(searchCaseReports(filters)),
  updateCaseReport: (report) => dispatch(updateCaseReport(report)),
});
const mapStateToProps = (state) => ({
  loading: state.CaseReports.loading,
  loadingPercentage: state.CaseReports.loadingPercentage,
  reports: state.CaseReports.reports,
  reportsFilters: state.CaseReports.reportsFilters,
  reportsFiltersExtents: state.CaseReports.reportsFiltersExtents,
  searchFilters: state.CaseReports.searchFilters,
  totalReports: state.CaseReports.totalReports,
  datafiles: state.CaseReports.datafiles,
  dataset: state.Settings.dataset,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ScrollToHOC(LandingPage))));
