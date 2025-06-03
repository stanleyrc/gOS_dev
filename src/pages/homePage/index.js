import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { ScrollToHOC } from "react-scroll-to";
import Wrapper from "./index.style";
import { Skeleton } from "antd";
import LandingPage from "../landingPage";
import DetailPage from "../detailPage";

class HomePage extends Component {
  render() {
    const { report, loading } = this.props;
    return (
      <Wrapper>
        {report ? (
          <Skeleton active loading={loading}>
            <DetailPage />
          </Skeleton>
        ) : (
          <LandingPage />
        )}
      </Wrapper>
    );
  }
}
HomePage.propTypes = {};
HomePage.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  report: state.Settings.report,
  loading: state.CaseReports.loading,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ScrollToHOC(HomePage))));
