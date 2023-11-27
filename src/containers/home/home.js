import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { ScrollToHOC } from "react-scroll-to";
import * as d3 from "d3";
import {
  Tabs,
  Row,
  Col,
  Skeleton,
  Affix,
  Avatar,
  Card,
  Divider,
  Space,
  Statistic,
} from "antd";
import HomeWrapper from "./home.style";
import HeaderPanel from "../../components/headerPanel";
import PopulationTab from "../../components/populationTab";
import SummaryTab from "../../components/summaryTab";
import FilteredEventsList from "../../components/filteredEventsListPanel";
import VariantQcTab from "../../components/variantQcTab";
import appActions from "../../redux/app/actions";

const { TabPane } = Tabs;
const { Meta } = Card;

const { selectReport } = appActions;

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
      selectReport,
      variantQC,
      ppFitImage,
      ppfit,
    } = this.props;

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
                  <Row className="ant-panel-container ant-home-plot-container">
                    <Col className="gutter-row" span={24}>
                      <FilteredEventsList />
                    </Col>
                  </Row>
                </TabPane>
                <TabPane tab={t("components.tabs.tab5")} key="5">
                  <Row className="ant-panel-container ant-home-plot-container">
                    <Col className="gutter-row" span={24}>
                      <VariantQcTab
                        variants={variantQC}
                        imageBlob={ppFitImage}
                        fits={ppfit}
                      />
                    </Col>
                  </Row>
                </TabPane>
              </Tabs>
            </div>
          )}
          {!report && (
            <div className="ant-panel-list-container">
              <Row gutter={[16, 16]}>
                {reports.map((d) => (
                  <Col className="gutter-row" span={4}>
                    <Card
                      onClick={(e) => selectReport(d.pair)}
                      hoverable
                      title={<b>{d.pair}</b>}
                      bordered={false}
                      extra={
                        <Avatar
                          style={{
                            backgroundColor: "#fde3cf",
                            color: "#f56a00",
                          }}
                        >
                          {d.tumor_type_final}
                        </Avatar>
                      }
                      actions={[
                        <Statistic
                          className="stats"
                          title={t(`metadata.svCount.short`)}
                          value={d3.format(",")(d["sv.count"])}
                        />,
                        <Statistic
                          className="stats"
                          title={t(`metadata.lohFraction.short`)}
                          value={d3.format(".2%")(d.loh_fraction)}
                        />,
                        <Statistic
                          className="stats"
                          title={t("metadata.purity-ploidy-title")}
                          value={d3.format(".2f")(d.purity)}
                          suffix={`/ ${d3.format(".2f")(d.ploidy)}`}
                        />,
                      ]}
                    >
                      <Meta
                        title={d.disease}
                        description={
                          <Space split={<Divider type="vertical" />}>
                            {d.inferred_sex}
                            {d.primary_site}
                          </Space>
                        }
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
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
});
const mapStateToProps = (state) => ({
  loading: state.App.loading,
  report: state.App.report,
  reports: state.App.reports,
  metadata: state.App.metadata,
  plots: state.App.populationMetrics,
  tumorPlots: state.App.tumorPopulationMetrics,
  variantQC: state.App.variantQC,
  ppFitImage: state.App.ppFitImage,
  ppfit: state.App.ppfit,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ScrollToHOC(Home))));
