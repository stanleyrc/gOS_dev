import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { Skeleton, Affix, Tabs } from "antd";
import HeaderPanel from "../../components/headerPanel";
import SummaryTab from "../../tabs/summaryTab";
import FilteredEventsTab from "../../tabs/filteredEventsTab";
import TracksTab from "../../tabs/tracksTab";
import Wrapper from "./index.style";
import PopulationTab from "../../tabs/populationTab";
import SageQcTab from "../../tabs/sageQcTab";
import BinQCTab from "../../tabs/binQCTab";
import SignaturesTab from "../../tabs/signaturesTab";
import SingleCellTab from "../../tabs/singleCellTab";
import SingleCellRnaTab from "../../tabs/singleCellRnaTab";
import CellContextBanner from "../../components/singleCell/cellContextBanner";
import settingsActions from "../../redux/settings/actions";
import {
  firstEnabledDetailTab,
  getDetailTabAvailability,
} from "../../helpers/detailTabAvailability";

const { updateTab, updateDomains, updateCaseReport } = settingsActions;

export class DetailView extends Component {
  state = { headerPinned: false, headerHeight: 0 };
  headerRef = React.createRef();

  componentDidMount() {
    this.redirectDisabledTab();
    this.observeHeader();
  }

  componentWillUnmount() {
    if (this.headerObserver) this.headerObserver.disconnect();
  }

  // The pinned header's height positions the sticky tab bar below it.
  observeHeader = () => {
    const el = this.headerRef.current;
    if (!el || this.headerObserver || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h !== this.state.headerHeight) this.setState({ headerHeight: h });
    };
    this.headerObserver = new ResizeObserver(measure);
    this.headerObserver.observe(el);
    measure();
  };

  componentDidUpdate(prevProps) {
    this.observeHeader();
    if (
      prevProps.tab !== this.props.tab ||
      prevProps.tabAvailability !== this.props.tabAvailability
    ) {
      this.redirectDisabledTab();
    }
  }

  redirectDisabledTab = () => {
    const { tab, tabAvailability, updateTab } = this.props;
    const activeTab = tab.toString();
    if (tabAvailability[activeTab] !== false) return;

    const firstEnabledTab = firstEnabledDetailTab(tabAvailability);
    if (firstEnabledTab && firstEnabledTab !== activeTab) {
      updateTab(firstEnabledTab);
    }
  };

  handleTabChanged = (tab) => {
    const { updateTab } = this.props;
    updateTab(tab);
  };

  handleBackToResults = () => {
    this.props.updateCaseReport(null);
  };

  render() {
    const {
      t,
      loading,
      pair,
      tab,
      tabAvailability,
      canReturnToResults,
    } = this.props;
    if (!pair) {
      return null;
    }
    const tabs = {
      0: <SummaryTab />,
      1: <FilteredEventsTab />,
      2: <TracksTab />,
      3: <PopulationTab />,
      4: <SageQcTab />,
      5: <BinQCTab />,
      6: <SignaturesTab />,
      7: <SingleCellTab />,
      8: <SingleCellRnaTab />,
    };
    // The single-cell tab only exists for single-cell patient entries; it
    // leads the tab bar there and is hidden for ordinary cases.
    // The RNA tab follows it when the patient has an rna/ export.
    let tabsOrder =
      tabAvailability[7] === true
        ? [7, ...(tabAvailability[8] === true ? [8] : []), 0, 1, 2, 3, 4, 5, 6]
        : [0, 1, 2, 3, 4, 5, 6];
    return (
      <Wrapper style={{ "--gos-header-h": `${this.state.headerHeight}px` }}>
        <Skeleton active loading={loading}>
          <Affix offsetTop={0} onChange={(affixed) => this.setState({ headerPinned: Boolean(affixed) })}>
            <div className="ant-home-header-container" ref={this.headerRef}>
              <HeaderPanel
                compact={this.state.headerPinned}
                canReturnToResults={canReturnToResults}
                onBackToResults={this.handleBackToResults}
              />
            </div>
          </Affix>
          <div className="ant-home-content-container">
            <CellContextBanner />
            <Tabs
              defaultActiveKey="1"
              activeKey={tab.toString()}
              onChange={(tab) => this.handleTabChanged(tab)}
              items={tabsOrder.map((key) => ({
                key: key.toString(),
                label: t(`containers.detail-view.tabs.tab${key}`),
                children: tabs[key],
                disabled: tabAvailability[key] === false,
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
  updateCaseReport: (report) => dispatch(updateCaseReport(report)),
  updateTab: (tab) => dispatch(updateTab(tab)),
  updateDomains: (domains) => dispatch(updateDomains(domains)),
});
const mapStateToProps = (state) => ({
  canReturnToResults: (state.CaseReports.reports || []).length > 0,
  loading: state.CaseReport.loading,
  pair: state.CaseReport.metadata?.pair,
  tab: state.Settings.tab,
  chromoBins: state.Settings.chromoBins,
  defaultDomain: state.Settings.defaultDomain,
  tabAvailability: getDetailTabAvailability(state),
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(DetailView)));
