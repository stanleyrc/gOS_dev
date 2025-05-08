import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { Skeleton, Affix, Tabs } from "antd";
import HeaderPanel from "../../components/headerPanel";
import SummaryTab from "../../tabs/summaryTab";
import TracksTab from "../../tabs/tracksTab";
import Wrapper from "./index.style";
import PopulationTab from "../../tabs/populationTab";
import SageQcTab from "../../tabs/sageQcTab";
import BinQCTab from "../../tabs/binQCTab";
import SignaturesTab from "../../tabs/signaturesTab";
import settingsActions from "../../redux/settings/actions";

const { updateTab, updateDomains } = settingsActions;

class DetailView extends Component {
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
                items={tabs.map((Component, i) => ({
                  key: (i + 1).toString(),
                  label: t(`containers.detail-view.tabs.tab${i + 1}`),
                  children: Component,
                }))}
            />
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
