import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { ScrollToHOC } from "react-scroll-to";
import { Skeleton } from "antd";
import Wrapper from "./index.style";
import ListView from "../../containers/listView";
import caseReportsActions from "../../redux/caseReports/actions";
import settingsActions from "../../redux/settings/actions";

const { searchCaseReports } = caseReportsActions;
const { updateCaseReport } = settingsActions;

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
      reports,
      totalReports,
      reportsFilters,
      searchCaseReports,
      searchFilters,
    } = this.props;
    return (
      <Wrapper>
        <Skeleton active loading={loading}>
          <ListView
            records={reports}
            handleCardClick={this.handleCardClick}
            filters={reportsFilters}
            onSearch={searchCaseReports}
            searchFilters={searchFilters}
            totalRecords={totalReports}
          />
        </Skeleton>
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
  reports: state.CaseReports.reports,
  reportsFilters: state.CaseReports.reportsFilters,
  searchFilters: state.CaseReports.searchFilters,
  totalReports: state.CaseReports.totalReports,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ScrollToHOC(LandingPage))));
