import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { Skeleton, Affix, Tabs } from "antd";
import HeaderPanel from "../../components/headerPanel";
import Wrapper from "./index.style";
import VignetteActionRunner from "../../components/singleCell/vignette/vignetteActionRunner";
import SiteUrlSync from "../../components/singleCell/siteUrlSync";
import CellContextBanner from "../../components/singleCell/cellContextBanner";
import { singleCellStillLoading } from "../../helpers/singleCell/deepLink";
import settingsActions from "../../redux/settings/actions";
import singleCellActions from "../../redux/singleCell/actions";
import { LEGACY_DRIVERS_TAB_KEY, LEGACY_STORY_TAB_KEY } from "../../helpers/detailTabAvailability";
import {
  firstEnabledDetailTab,
  getDetailTabAvailability,
} from "../../helpers/detailTabAvailability";


// tabs load on demand (own webpack chunks)
const SummaryTab = React.lazy(() => import("../../tabs/summaryTab"));
const FilteredEventsTab = React.lazy(() => import("../../tabs/filteredEventsTab"));
const TracksTab = React.lazy(() => import("../../tabs/tracksTab"));
const PopulationTab = React.lazy(() => import("../../tabs/populationTab"));
const SageQcTab = React.lazy(() => import("../../tabs/sageQcTab"));
const BinQCTab = React.lazy(() => import("../../tabs/binQCTab"));
const SignaturesTab = React.lazy(() => import("../../tabs/signaturesTab"));
const SingleCellTab = React.lazy(() => import("../../tabs/singleCellTab"));
const SingleCellRnaTab = React.lazy(() => import("../../tabs/singleCellRnaTab"));
const SingleCellSignaturesTab = React.lazy(() => import("../../tabs/singleCellSignaturesTab"));
const SingleCellRnaCnTab = React.lazy(() => import("../../tabs/singleCellRnaCnTab"));
const SingleCellQcTab = React.lazy(() => import("../../tabs/singleCellQcTab"));
const SingleCellReportTab = React.lazy(() => import("../../tabs/singleCellReportTab"));
const SingleCellEcdnaTab = React.lazy(() => import("../../tabs/singleCellEcdnaTab"));
const SingleCellCircosTab = React.lazy(() => import("../../tabs/singleCellCircosTab"));
const SingleCellEvidenceTab = React.lazy(() => import("../../tabs/singleCellEvidenceTab"));
const SingleCellPpfitTab = React.lazy(() => import("../../tabs/singleCellPpfitTab"));
const SingleCellEventsTab = React.lazy(() => import("../../tabs/singleCellEventsTab"));
const SingleCellCompareTreesTab = React.lazy(() => import("../../tabs/singleCellCompareTreesTab"));
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
    const { tab, tabAvailability, updateTab, singleCellLoading, openDriversLayer } = this.props;
    const activeTab = tab.toString();
    // the retired Drivers tab: an old tab=17 link opens the Single-Cell tab with the Drivers layer on
    if (activeTab === LEGACY_DRIVERS_TAB_KEY) {
      openDriversLayer();
      updateTab("7");
      return;
    }
    // the retired Story tab was merged into the Summary tab (12)
    if (activeTab === LEGACY_STORY_TAB_KEY) {
      updateTab("12");
      return;
    }
    // bulk-WGS tabs 0-6 are hidden for single-cell patients: old links to them open the Single-Cell tab
    if (tabAvailability[7] === true && /^[0-6]$/.test(activeTab)) {
      updateTab("7");
      return;
    }
    if (tabAvailability[activeTab] !== false) return;
    // a linked single-cell tab (RNA, ecDNA, ...) is unavailable until the patient's files load
    if (Number(activeTab) >= 7 && singleCellLoading) return;

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
      9: <SingleCellSignaturesTab />,
      10: <SingleCellRnaCnTab />,
      11: <SingleCellQcTab />,
      12: <SingleCellReportTab />,
      13: <SingleCellCircosTab />,
      14: <SingleCellEcdnaTab />,
      15: <SingleCellEvidenceTab />,
      18: <SingleCellCompareTreesTab />,
      19: <SingleCellPpfitTab />,
      20: <SingleCellEventsTab />,
    };
    // The single-cell tab only exists for single-cell patient entries; it
    // leads the tab bar there and is hidden for ordinary cases.
    // The RNA tab follows it when the patient has an rna/ export.
    let tabsOrder =
      tabAvailability[7] === true
        ? [7, ...[12, 20, 18, 14, 8, 10, 9, 11, 19, 15, 13].filter((k) => tabAvailability[k] === true)] // bulk-WGS tabs 0-6 are hidden for single-cell patients (they have no bulk data; code kept)
        : [0, 1, 2, 3, 4, 5, 6];
    return (
      <Wrapper className={this.props.compactHeader ? "gos-compact-header" : undefined} style={{ "--gos-header-h": `${this.state.headerHeight}px` }}>
        <Skeleton active loading={loading}>
          <Affix offsetTop={0} onChange={(affixed) => this.setState({ headerPinned: Boolean(affixed) })}>
            <div className="ant-home-header-container" ref={this.headerRef}>
              <HeaderPanel
                compact={this.state.headerPinned || Boolean(this.props.compactHeader)}
                canReturnToResults={canReturnToResults}
                onBackToResults={this.handleBackToResults}
              />
            </div>
          </Affix>
          <div className="ant-home-content-container">
            <SiteUrlSync />
            <CellContextBanner />
            <VignetteActionRunner />
            <Tabs
              defaultActiveKey="1"
              activeKey={tab.toString()}
              onChange={(tab) => this.handleTabChanged(tab)}
              items={tabsOrder.map((key) => ({
                key: key.toString(),
                label: t(`containers.detail-view.tabs.tab${key}`),
                children: <React.Suspense fallback={<Skeleton active />}>{tabs[key]}</React.Suspense>,
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
  openDriversLayer: () => {
    // the single-cell files may still be loading: leave heatmap=drivers in the URL for the deep-link reader
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("heatmap", "drivers");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch (error) {
      // no window: the redux update below is enough
    }
    dispatch(singleCellActions.updateHeatmapType("drivers"));
  },
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
  singleCellLoading: singleCellStillLoading(state.SingleCell),
  compactHeader: Boolean(state.SingleCell.layout?.compactHeader) && state.SingleCell.patient != null && !state.SingleCell.missing,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(DetailView)));
