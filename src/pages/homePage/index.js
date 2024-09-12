import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { ScrollToHOC } from "react-scroll-to";
import Wrapper from "./index.style";
import LandingPage from "../landingPage";
import DetailPage from "../detailPage";
import settingsActions from "../../redux/settings/actions";

const { updateCaseReport } = settingsActions;

class HomePage extends Component {
  componentDidMount() {
    const { updateCaseReport, location } = this.props;
    updateCaseReport(new URLSearchParams(location.search).get("report"));
  }
  render() {
    const { report } = this.props;
    return <Wrapper>{report ? <DetailPage /> : <LandingPage />}</Wrapper>;
  }
}
HomePage.propTypes = {};
HomePage.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateCaseReport: (tab) => dispatch(updateCaseReport(tab)),
});
const mapStateToProps = (state) => ({
  report: state.Settings.report,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ScrollToHOC(HomePage))));
