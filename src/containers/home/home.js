import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { ScrollToHOC } from "react-scroll-to";
import { Tabs, Row, Col, Skeleton, Affix } from "antd";
import HomeWrapper from "./home.style";
import HeaderPanel from "../../components/headerPanel";
import SummaryTable from "../../components/summaryTable";
import PopulationTab from "../../components/populationTab";
import SummaryTab from "../../components/summaryTab";

const { TabPane } = Tabs;

class Home extends Component {
  render() {
    const { t, loading, selectedFile, plots } = this.props;
    if (!selectedFile) return null;
    return (
      <HomeWrapper>
        <Skeleton active loading={loading}>
          <Affix offsetTop={0}>
            <div className="ant-home-header-container">
              <HeaderPanel />
            </div>
          </Affix>
          <div className="ant-home-content-container">
            <Tabs defaultActiveKey="1">
              <Tabs.TabPane tab={t("components.tabs.tab1")} key="1">
                <SummaryTab {...{ loading, selectedFile, plots }} />
              </Tabs.TabPane>
              <Tabs.TabPane tab={t("components.tabs.tab2")} key="2">
                <PopulationTab {...{ loading, selectedFile, plots }} />
              </Tabs.TabPane>
              <Tabs.TabPane tab={t("components.tabs.tab3")} key="3">
                <Row className="ant-panel-container ant-home-plot-container">
                  <Col className="gutter-row" span={24}>
                    <SummaryTable />
                  </Col>
                </Row>
              </Tabs.TabPane>
            </Tabs>
          </div>
        </Skeleton>
      </HomeWrapper>
    );
  }
}
Home.propTypes = {};
Home.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  loading: state.App.loading,
  plots: state.App.plots,
  selectedFile: state.App.selectedFile,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ScrollToHOC(Home))));
