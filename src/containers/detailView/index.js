import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { Skeleton, Affix, Tabs } from "antd";
import {
  replaceSearchParams,
  locationToDomains,
  domainsToLocation,
} from "../../helpers/utility";
import HeaderPanel from "../../components/headerPanel";
import SummaryTab from "../../tabs/summaryTab";
import TracksTab from "../../tabs/tracksTab";
import Wrapper from "./index.style";
import PopulationTab from "../../tabs/populationTab";
import SageQcTab from "../../tabs/sageQcTab";
import BinQCTab from "../../tabs/binQCTab";
import SignaturesTab from "../../tabs/signaturesTab";
import settingsActions from "../../redux/settings/actions";

const { TabPane } = Tabs;

const { updateTab, updateDomains } = settingsActions;

class DetailView extends Component {
  componentDidMount() {
    const {
      updateTab,
      updateDomains,
      location,
      defaultDomain,
      chromoBins,
    } = this.props;
    let domainString = new URLSearchParams(location.search).get("location");
    updateTab(new URLSearchParams(location.search).get("tab") || 1);
    let domains = domainString
      ? locationToDomains(chromoBins, domainString)
      : [defaultDomain];
    domainString = domainsToLocation(chromoBins, domains);
    updateDomains(domains);
  }

  handleTabChanged = (tab) => {
    const { updateTab } = this.props;
    updateTab(tab);
  };

  render() {
    const { t, loading, pair, tab } = this.props;
    if (!pair) {
      return null;
    }
    const tabs = [
      <SummaryTab />,
      <TracksTab />,
      <PopulationTab />,
      <SageQcTab />,
      <BinQCTab />,
      <SignaturesTab />,
    ];
    return (
      <Wrapper>
        <Skeleton active loading={loading}>
          <Affix offsetTop={0}>
            <div className="ant-home-header-container">
              <HeaderPanel />
            </div>
          </Affix>
          <div className="ant-home-content-container">
            <Tabs
              defaultActiveKey="1"
              activeKey={tab.toString()}
              onChange={(tab) => this.handleTabChanged(tab)}
            >
              {tabs.map((d, i) => (
                <TabPane
                  tab={t(`containers.detail-view.tabs.tab${i + 1}`)}
                  key={i + 1}
                >
                  {d}
                </TabPane>
              ))}
            </Tabs>
          </div>
        </Skeleton>
      </Wrapper>
    );
  }
}
DetailView.propTypes = {};
DetailView.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateTab: (tab) => dispatch(updateTab(tab)),
  updateDomains: (domains) => dispatch(updateDomains(domains)),
});
const mapStateToProps = (state) => ({
  loading: state.CaseReport.loading,
  pair: state.CaseReport.metadata?.pair,
  tab: state.Settings.tab,
  chromoBins: state.Settings.chromoBins,
  defaultDomain: state.Settings.defaultDomain,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(DetailView)));
