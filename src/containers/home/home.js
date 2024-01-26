import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { ScrollToHOC } from "react-scroll-to";
import { Tabs, Skeleton, Affix, Card } from "antd";
import { reportFilters } from "../../helpers/utility";
import HomeWrapper from "./home.style";
import HeaderPanel from "../../components/headerPanel";
import PopulationTab from "../../components/populationTab";
import SummaryTab from "../../components/summaryTab";

import VariantQcTab from "../../components/variantQcTab";
import appActions from "../../redux/app/actions";
import BinQCTab from "../../components/binQCTab";
import ListView from "../listView";

const { TabPane } = Tabs;
const { Meta } = Card;

const { selectReport, searchReports } = appActions;

class Home extends Component {
  render() {
    const {
      t,
      loading,
      metadata,
      plots,
      tumorPlots,
      report,
      reports,
      totalReports,
      selectReport,
      variantQC,
      ppFitImage,
      ppfit,
      chromoBins,
      reportsFilters,
      searchReports,
      searchFilters,
      coverageData,
      genesData,
    } = this.props;
    if (!metadata) return null;
    const { beta, gamma } = metadata;
    return (
      <HomeWrapper>
        <Skeleton active loading={loading}>
          {report && (
            <Affix offsetTop={0}>
              <div className="ant-home-header-container">
                <HeaderPanel />
              </div>
            </Affix>
          )}
          {report && (
            <div className="ant-home-content-container">
              <Tabs defaultActiveKey="1">
                <TabPane tab={t("components.tabs.tab1")} key="1">
                  <SummaryTab />
                </TabPane>
                <TabPane tab={t("components.tabs.tab2")} key="2">
                  <PopulationTab {...{ loading, metadata, plots }} />
                </TabPane>
                <TabPane
                  tab={t("components.tabs.tab3", { tumor: metadata.tumor })}
                  key="3"
                >
                  <PopulationTab
                    {...{ loading, metadata, plots: tumorPlots }}
                  />
                </TabPane>
                <TabPane tab={t("components.tabs.tab4")} key="4">
                  <VariantQcTab variants={variantQC} />
                </TabPane>
                <TabPane tab={t("components.tabs.tab5")} key="5">
                  <BinQCTab
                    imageBlob={ppFitImage}
                    fits={ppfit}
                    coverageData={coverageData}
                    genesData={genesData}
                    chromoBins={chromoBins}
                    slope={1 / beta}
                    intercept={gamma / beta}
                  />
                </TabPane>
              </Tabs>
            </div>
          )}
          {!report && (
            <ListView
              records={reports}
              handleCardClick={selectReport}
              filters={reportsFilters}
              onSearch={searchReports}
              searchFilters={searchFilters}
              totalRecords={totalReports}
            />
          )}
        </Skeleton>
      </HomeWrapper>
    );
  }
}
Home.propTypes = {};
Home.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  selectReport: (report) => dispatch(selectReport(report)),
  searchReports: (filters) => dispatch(searchReports(filters)),
});
const mapStateToProps = (state) => ({
  loading: state.App.loading,
  report: state.App.report,
  reports: state.App.reports,
  reportsFilters: state.App.reportsFilters,
  searchFilters: state.App.searchFilters,
  totalReports: state.App.totalReports,
  metadata: state.App.metadata,
  plots: state.App.populationMetrics,
  tumorPlots: state.App.tumorPopulationMetrics,
  variantQC: state.App.variantQC,
  ppFitImage: state.App.ppFitImage,
  ppfit: state.App.ppfit,
  chromoBins: state.App.chromoBins,
  coverageData: state.App.coverageData,
  genesData: state.App.genesData,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ScrollToHOC(Home))));
