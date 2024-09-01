import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { ScrollToHOC } from "react-scroll-to";
import { Skeleton } from "antd";
import Wrapper from "./index.style";
import DetailView from "../../containers/detailView";
import DetailErrorView from "../../containers/detailErrorView";

class DetailPage extends Component {
  render() {
    const { loading, error } = this.props;
    return (
      <Wrapper>
        <Skeleton active loading={loading}>
          {error ? <DetailErrorView /> : <DetailView />}
        </Skeleton>
      </Wrapper>
    );
  }
}
DetailPage.propTypes = {};
DetailPage.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  loading: state.CaseReport.loading,
  metadata: state.CaseReport.metadata,
  error: state.CaseReport.error,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ScrollToHOC(DetailPage))));
