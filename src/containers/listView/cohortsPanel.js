import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import * as d3 from "d3";
import {
  Row,
  Col,
  Divider,
  Skeleton,
  Card,
  Empty,
  Space,
  Spin,
  Typography,
} from "antd";
import HistogramPlotPanel from "../../components/histogramPlotPanel";
import SavedQuerySelector from "../../components/savedQuerySelector";
import Wrapper from "./index.style";
import populationStatisticsActions from "../../redux/populationStatistics/actions";

const { fetchCohortStatistics } = populationStatisticsActions;

const { Text } = Typography;

class CohortsPanel extends Component {
  state = {
    selectedFavoriteIds: [],
  };

  handleFavoriteSelectionChange = (selectedFavoriteIds) => {
    this.setState({ selectedFavoriteIds });
    this.fetchComparisonCohorts(selectedFavoriteIds);
  };

  fetchComparisonCohorts = (selectedFavoriteIds = this.state.selectedFavoriteIds) => {
    const { favoriteSearches, fetchCohortStatistics } = this.props;

    selectedFavoriteIds
      .map((favoriteId) =>
        favoriteSearches.find((favoriteSearch) => favoriteSearch.id === favoriteId)
      )
      .filter((favoriteSearch) => favoriteSearch?.searchId)
      .forEach((favoriteSearch) => {
        fetchCohortStatistics(favoriteSearch.searchId, {
          comparison: true,
          label: favoriteSearch.name,
        });
      });
  };

  getSelectedFavorites = () =>
    this.state.selectedFavoriteIds
      .map((favoriteId) =>
        this.props.favoriteSearches.find(
          (favoriteSearch) => favoriteSearch.id === favoriteId
        )
      )
      .filter((favoriteSearch) => favoriteSearch?.searchId);

  getComparisonOverlays = (plot, selectedFavorites, colorScale) => {
    const { comparisonCohorts } = this.props;

    return selectedFavorites
      .map((favoriteSearch) => {
        const comparisonPlot = comparisonCohorts?.[
          favoriteSearch.searchId
        ]?.cohort?.find((candidatePlot) => candidatePlot.id === plot.id);

        if (!comparisonPlot?.data?.length) {
          return null;
        }

        return {
          id: favoriteSearch.id,
          label: favoriteSearch.name,
          color: colorScale(favoriteSearch.id),
          data: comparisonPlot.data,
          dataset: comparisonPlot.dataset,
          bandwidth: comparisonPlot.bandwidth,
          range: comparisonPlot.range,
        };
      })
      .filter(Boolean);
  };

  renderComparisonControls = (selectedFavorites, colorScale) => {
    const { t, favoriteSearches, comparisonCohortsLoading } = this.props;
    const comparisonLoading = selectedFavorites.some(
      (favoriteSearch) => comparisonCohortsLoading?.[favoriteSearch.searchId]
    );

    return (
      <div className="cohort-comparison-toolbar">
        <div className="cohort-comparison-controls">
          <Text type="secondary">
            {t("containers.list-view.cohorts.compare-label")}
          </Text>
          <div className="cohort-comparison-select-wrap">
            <SavedQuerySelector
              favoriteSearches={favoriteSearches}
              selectedFavoriteIds={this.state.selectedFavoriteIds}
              onChange={this.handleFavoriteSelectionChange}
            />
          </div>
          {comparisonLoading && <Spin size="small" />}
        </div>
        {selectedFavorites.length > 0 && (
          <Space wrap size={[12, 4]} className="cohort-comparison-legend">
            <span className="cohort-comparison-legend-item">
              <span className="cohort-comparison-legend-swatch current" />
              <Text type="secondary">
                {t("containers.list-view.cohorts.current-query")}
              </Text>
            </span>
            {selectedFavorites.map((favoriteSearch) => (
              <span
                key={favoriteSearch.id}
                className="cohort-comparison-legend-item"
              >
                <span
                  className="cohort-comparison-legend-swatch"
                  style={{ backgroundColor: colorScale(favoriteSearch.id) }}
                />
                <Text type="secondary">{favoriteSearch.name}</Text>
              </span>
            ))}
          </Space>
        )}
      </div>
    );
  };

  render() {
    const { t, loading, plots } = this.props;
    const selectedFavorites = this.getSelectedFavorites();
    const colorScale = d3
      .scaleOrdinal(d3.schemeTableau10)
      .domain(selectedFavorites.map((favoriteSearch) => favoriteSearch.id));

    let plotGroups = d3.groups(
      plots.filter((d) => d.data && d.data.length > 0),
      (d) => d.group
    );

    let plotTuples = plotGroups.map(([group, groupPlots]) => {
      let groupTitle = groupPlots[0]?.groupTitle || group;
      let plotRows = groupPlots
        .sort((a, b) => d3.ascending(a.order, b.order))
        .map((d, index) => {
          let plotComponent = (
            <HistogramPlotPanel
              {...{
                id: d.id,
                data: d.data,
                dataset: d.dataset,
                q1: d.q1,
                q3: d.q3,
                q99: d.q99,
                scaleX: d.scaleX,
                range: d.range,
                bandwidth: d.bandwidth,
                title: d.title,
                group: d.group,
                groupTitle: d.groupTitle,
                order: d.order,
                visible: d.data,
                format: d.format,
                overlays: this.getComparisonOverlays(
                  d,
                  selectedFavorites,
                  colorScale
                ),
                loading,
              }}
            />
          );

          return plotComponent;
        });

      let tuples = Array.from(
        { length: Math.ceil(plotRows.length / 3) },
        (_, i) => plotRows.slice(i * 3, i * 3 + 3)
      );
      return { groupTitle, tuples };
    });

    return (
      <>
        <Wrapper>
        {this.renderComparisonControls(selectedFavorites, colorScale)}
        <Skeleton active loading={loading}>
          {plotGroups.length > 0 ? (
            plotTuples.map(({ groupTitle, tuples }, groupIndex) => (
              <div key={groupIndex} className="population-plot-group">
                <Divider plain orientation="left">
                  {groupTitle}
                </Divider>
                {tuples.map((pair, index) => (
                  <Row
                    key={index}
                    id={`row-${groupIndex}-${index}`}
                    className="ant-panel-container ant-home-plot-container"
                    gutter={16}
                  >
                    {pair.map((plotComponent, i) => (
                      <Col
                        key={i}
                        className="gutter-row"
                        span={Math.floor(24 / pair.length)}
                      >
                        {plotComponent}
                      </Col>
                    ))}
                  </Row>
                ))}
              </div>
            ))
          ) : (
            <Card>
              <Empty description={t("containers.list-view.no_data")} />
            </Card>
          )}
        </Skeleton>
        </Wrapper>
      </>
    );
  }
}

CohortsPanel.propTypes = {};
CohortsPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  fetchCohortStatistics: (searchId, options) =>
    dispatch(fetchCohortStatistics(searchId, options)),
});
const mapStateToProps = (state) => ({
  plots: state.PopulationStatistics.cohort,
  loading: state.PopulationStatistics.cohortsLoading,
  currentSearchId: state.CaseReports.currentSearchId,
  favoriteSearches: state.CaseReports.favoriteSearches,
  comparisonCohorts: state.PopulationStatistics.comparisonCohorts,
  comparisonCohortsLoading: state.PopulationStatistics.comparisonCohortsLoading,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(CohortsPanel));
