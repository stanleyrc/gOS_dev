import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { ScrollToHOC } from "react-scroll-to";
import { Tabs, Skeleton, Affix, Card, Segmented, Space } from "antd";
import { reportFilters, mutationFilterTypes } from "../../helpers/utility";
import * as d3 from "d3";
import HomeWrapper from "./home.style";
import HeaderPanel from "../../components/headerPanel";
import PopulationTab from "../../components/populationPanel";
import SummaryTab from "../../tabs/summaryTab";
import QcTab from "../../tabs/sageQcTab";
import appActions from "../../redux/app/actions";
import BinQCTab from "../../tabs/binQCTab";
import ListView from "../listView";
import TracksTab from "../../tabs/tracksTab";
import BarPlotPanel from "../../components/barPlotPanel";
import PopulationPanel from "../../components/populationPanel";

const { TabPane } = Tabs;
const { Meta } = Card;

const { selectReport, searchReports, selectTab } = appActions;

class Home extends Component {
  state = {
    populationKPIMode: "total",
    signatureKPIMode: "total",
    signatureFractionMode: "count",
    signatureDistributionMode: "population",
    mutationFilter: "sbs",
  };

  handleTabChanged = (tab) => {
    const { selectTab } = this.props;
    selectTab(tab);
  };

  handleCardClick = (event, report) => {
    event.stopPropagation();
    // In case cmd buttom is clicked
    if (event.metaKey) {
      let url = new URL(decodeURI(document.location));
      url.searchParams.set("report", report);
      const newWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (newWindow) newWindow.opener = null;
    } else {
      this.props.selectReport(report);
    }
  };

  handlePopulationKPIsSegmentedChange = (populationKPIMode) => {
    this.setState({ populationKPIMode });
  };

  handleSignatureKPIsTumourSegmentedChange = (signatureKPIMode) => {
    this.setState({ signatureKPIMode });
  };

  handleSignatureKPIsFractionSegmentedChange = (signatureFractionMode) => {
    this.setState({ signatureFractionMode });
  };

  handleSignatureDistributionModeSegmentedChange = (
    signatureDistributionMode
  ) => {
    this.setState({ signatureDistributionMode });
  };

  handleMutationCatalogSegmentedChange = (mutationFilter) => {
    this.setState({ mutationFilter });
  };

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
      sageQC,
      mutationCatalog,
      decomposedCatalog,
      referenceCatalog,
      mutationsColorPalette,
      ppFitImage,
      ppfit,
      chromoBins,
      reportsFilters,
      searchReports,
      searchFilters,
      coverageData,
      hetsnpsData,
      genesData,
      tab,
      signaturePlots,
      signatureTumorPlots,
    } = this.props;
    if (!metadata) return null;
    const { beta, gamma } = metadata;
    const {
      populationKPIMode,
      signatureKPIMode,
      signatureFractionMode,
      signatureDistributionMode,
      mutationFilter,
    } = this.state;
    let colorPalette = mutationsColorPalette
      ? Object.fromEntries(
          (mutationFilterTypes()[mutationFilter] || []).map((key) => [
            key,
            mutationsColorPalette[key],
          ])
        )
      : {};
    let legendPaletteTitles = mutationsColorPalette
      ? Object.fromEntries(
          (mutationFilterTypes()[mutationFilter] || []).map((key) => [
            key,
            t(`metadata.mutation-catalog-titles.${key}`),
          ])
        )
      : {};
    let catalog = mutationCatalog.filter(
      (d) => d.variantType === mutationFilter
    );

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
              <Tabs
                defaultActiveKey="1"
                activeKey={tab.toString()}
                onChange={(tab) => this.handleTabChanged(tab)}
              >
                <TabPane tab={t("components.tabs.tab1")} key="1">
                  <SummaryTab />
                </TabPane>
                <TabPane tab={t("components.tabs.tab2")} key="2">
                  <TracksTab />
                </TabPane>
                <TabPane tab={t("components.tabs.tab3")} key="3">
                  <Segmented
                    size="small"
                    options={[
                      {
                        label: t("components.segmented-filter.total"),
                        value: "total",
                      },
                      {
                        label: t("components.segmented-filter.tumor", {
                          tumor: metadata.tumor,
                        }),
                        value: "byTumor",
                      },
                    ]}
                    onChange={(d) =>
                      this.handlePopulationKPIsSegmentedChange(d)
                    }
                  />
                  <PopulationPanel
                    {...{
                      loading,
                      metadata,
                      plots,
                      visible: populationKPIMode === "total",
                      scope: "common",
                    }}
                  />
                  <PopulationPanel
                    {...{
                      loading,
                      metadata,
                      plots: tumorPlots,
                      visible: populationKPIMode === "byTumor",
                      scope: "common",
                    }}
                  />
                </TabPane>
                <TabPane tab={t("components.tabs.tab4")} key="4">
                  <QcTab dataPoints={sageQC} />
                </TabPane>
                <TabPane tab={t("components.tabs.tab5")} key="5">
                  <BinQCTab
                    imageBlob={ppFitImage}
                    fits={ppfit}
                    coverageData={coverageData}
                    hetsnpsData={hetsnpsData}
                    genesData={genesData}
                    chromoBins={chromoBins}
                    slope={1 / beta}
                    intercept={gamma / beta}
                  />
                </TabPane>
                <TabPane tab={t("components.tabs.tab6")} key="6">
                  <Affix offsetTop={194}>
                    <BarPlotPanel
                      dataPoints={catalog}
                      title={t("components.mutation-catalog-panel.title")}
                      legendTitle={t("metadata.mutation-type")}
                      xTitle={""}
                      xVariable={"type"}
                      xFormat={null}
                      yTitle={t("components.mutation-catalog-panel.y-title")}
                      yVariable={"mutations"}
                      yFormat={"~s"}
                      colorVariable={"mutationType"}
                      colorPalette={colorPalette}
                      legendTitles={legendPaletteTitles}
                      segmentedOptions={Object.keys(mutationFilterTypes()).map(
                        (d) => {
                          return {
                            label: t(
                              `components.mutation-catalog-panel.segmented-filter.${d}`
                            ),
                            value: d,
                          };
                        }
                      )}
                      segmentedValue={mutationFilter}
                      handleSegmentedChange={
                        this.handleMutationCatalogSegmentedChange
                      }
                    />
                  </Affix>
                  <br />
                  <Space>
                    <Segmented
                      size="small"
                      options={[
                        {
                          label: t("components.segmented-filter.total"),
                          value: "total",
                        },
                        {
                          label: t("components.segmented-filter.tumor", {
                            tumor: metadata.tumor,
                          }),
                          value: "byTumor",
                        },
                      ]}
                      onChange={(d) =>
                        this.handleSignatureKPIsTumourSegmentedChange(d)
                      }
                      value={signatureKPIMode}
                    />
                    <Segmented
                      size="small"
                      options={[
                        {
                          label: t("components.segmented-filter.fraction"),
                          value: "fraction",
                        },
                        {
                          label: t("components.segmented-filter.count"),
                          value: "count",
                        },
                      ]}
                      onChange={(d) =>
                        this.handleSignatureKPIsFractionSegmentedChange(d)
                      }
                      value={signatureFractionMode}
                    />
                    <Segmented
                      size="small"
                      options={[
                        {
                          label: t(
                            "components.segmented-filter.population-mode"
                          ),
                          value: "population",
                        },
                        {
                          label: t(
                            "components.segmented-filter.decomposed-mode"
                          ),
                          value: "decomposed",
                        },
                      ]}
                      onChange={(d) =>
                        this.handleSignatureDistributionModeSegmentedChange(d)
                      }
                      value={signatureDistributionMode}
                    />
                  </Space>

                  {signatureDistributionMode === "decomposed" && (
                    <Space
                      direction="vertical"
                      size="middle"
                      style={{
                        display: "flex",
                      }}
                    >
                      <br />
                      {decomposedCatalog
                        .filter((d) => d.variantType === mutationFilter)
                        .sort((a, b) =>
                          d3.descending(
                            d3.sum(a.catalog, (d) => d.mutations),
                            d3.sum(b.catalog, (d) => d.mutations)
                          )
                        )
                        .map((d, i) => (
                          <BarPlotPanel
                            dataPoints={d.catalog}
                            referenceDataPoints={
                              referenceCatalog.find((e) => e.id === d.id)
                                .catalog
                            }
                            title={
                              <Space>
                                <span>
                                  {t("components.mutation-catalog-panel.title")}
                                </span>
                                <span>{d.id}</span>
                                <span
                                  dangerouslySetInnerHTML={{
                                    __html: t(`general.mutation`, {
                                      count: d3.sum(
                                        d.catalog,
                                        (d) => d.mutations
                                      ),
                                    }),
                                  }}
                                />
                              </Space>
                            }
                            legendTitle={t("metadata.mutation-type")}
                            xTitle={""}
                            xVariable={"type"}
                            xFormat={null}
                            yTitle={t(
                              "components.mutation-catalog-panel.y-title"
                            )}
                            yVariable={"mutations"}
                            yFormat={"~s"}
                            colorVariable={"mutationType"}
                            colorPalette={colorPalette}
                            legendTitles={legendPaletteTitles}
                            segmentedOptions={Object.keys(
                              mutationFilterTypes()
                            ).map((d) => {
                              return {
                                label: t(
                                  `components.mutation-catalog-panel.segmented-filter.${d}`
                                ),
                                value: d,
                              };
                            })}
                            segmentedValue={mutationFilter}
                            handleSegmentedChange={
                              this.handleMutationCatalogSegmentedChange
                            }
                          />
                        ))}
                    </Space>
                  )}

                  {signatureDistributionMode === "population" && (
                    <Space
                      direction="vertical"
                      size="middle"
                      style={{
                        display: "flex",
                      }}
                    >
                      <PopulationTab
                        {...{
                          loading,
                          metadata,
                          plots:
                            signaturePlots[mutationFilter][
                              signatureFractionMode
                            ],
                          visible: signatureKPIMode === "total",
                          scope: "signatures",
                        }}
                      />
                      <PopulationTab
                        {...{
                          loading,
                          metadata,
                          plots:
                            signatureTumorPlots[mutationFilter][
                              signatureFractionMode
                            ],
                          visible: signatureKPIMode === "byTumor",
                          scope: "signatures",
                        }}
                      />
                    </Space>
                  )}
                </TabPane>
              </Tabs>
            </div>
          )}
          {!report && (
            <ListView
              records={reports}
              handleCardClick={this.handleCardClick}
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
  selectTab: (tab) => dispatch(selectTab(tab)),
});
const mapStateToProps = (state) => ({
  loading: state.App.loading,
  report: state.App.report,
  reports: state.App.reports,
  reportsFilters: state.App.reportsFilters,
  searchFilters: state.App.searchFilters,
  totalReports: state.App.totalReports,
  metadata: state.App.metadata,
  mutationsColorPalette: state.App.settings?.mutationsColorPalette,
  signaturesList: state.App.settings?.signaturesList,
  plots: state.App.populationMetrics,
  tumorPlots: state.App.tumorPopulationMetrics,
  signaturePlots: state.App.signatureMetrics,
  signatureTumorPlots: state.App.tumorSignatureMetrics,
  sageQC: state.App.sageQC,
  mutationCatalog: state.App.mutationCatalog,
  decomposedCatalog: state.App.decomposedCatalog,
  referenceCatalog: state.App.referenceCatalog,
  ppFitImage: state.App.ppFitImage,
  ppfit: state.App.ppfit,
  chromoBins: state.App.chromoBins,
  coverageData: state.App.coverageData,
  hetsnpsData: state.App.hetsnpsData,
  genesData: state.App.genesData,
  tab: state.App.tab,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ScrollToHOC(Home))));
