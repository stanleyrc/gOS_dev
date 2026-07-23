import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import ContainerDimensions from "react-container-dimensions";
import handleViewport from "react-in-viewport";
import * as d3 from "d3";
import {
  Card,
  Space,
  Tooltip,
  Button,
  message,
  Row,
  Col,
  Spin,
  Typography,
} from "antd";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import { LuChartNoAxesGantt } from "react-icons/lu";

import { downloadCanvasAsPng, transitionStyle } from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import Wrapper from "./index.style";
import ParallelCoordinatesPlot from "../parallelCoordinatesPlot";
import SavedQuerySelector from "../savedQuerySelector";
import populationStatisticsActions from "../../redux/populationStatistics/actions";

const margins = {
  padding: 0,
  gap: 0,
};

const { Text } = Typography;
const { fetchCohortStatistics } = populationStatisticsActions;

class ParallelCoordinatesPanel extends Component {
  container = null;

  state = {
    selectedFavoriteIds: [],
  };

  handleFavoriteSelectionChange = (selectedFavoriteIds) => {
    this.setState({ selectedFavoriteIds });
    this.fetchComparisonCohorts(selectedFavoriteIds);
  };

  fetchComparisonCohorts = (
    selectedFavoriteIds = this.state.selectedFavoriteIds,
  ) => {
    const { favoriteSearches, fetchCohortStatistics } = this.props;

    selectedFavoriteIds
      .map((favoriteId) =>
        favoriteSearches.find(
          (favoriteSearch) => favoriteSearch.id === favoriteId,
        ),
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
          (favoriteSearch) => favoriteSearch.id === favoriteId,
        ),
      )
      .filter((favoriteSearch) => favoriteSearch?.searchId);

  getComparisonGroups = (selectedFavorites, colorScale) =>
    selectedFavorites
      .map((favoriteSearch) => {
        const comparisonData = this.props.comparisonCohorts?.[
          favoriteSearch.searchId
        ]?.cohort;

        if (!Array.isArray(comparisonData) || comparisonData.length === 0) {
          return null;
        }

        return {
          id: favoriteSearch.id,
          label: favoriteSearch.name,
          color: colorScale(favoriteSearch.id),
          data: comparisonData,
        };
      })
      .filter(Boolean);

  renderComparisonControls = (selectedFavorites, colorScale) => {
    const { t, favoriteSearches, comparisonCohortsLoading } = this.props;
    const comparisonLoading = selectedFavorites.some(
      (favoriteSearch) =>
        comparisonCohortsLoading?.[favoriteSearch.searchId],
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

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.title.replace(/\s+/g, "_").toLowerCase()}.png`,
        );
      })
      .catch((error) => {
        message.error(this.props.t("general.error", { error }));
      });
  };

  render() {
    const {
      t,
      loading,
      id,
      data,
      title,
      inViewport,
      visible,
      handleCardClick,
    } = this.props;
    const selectedFavorites = this.getSelectedFavorites();
    const colorScale = d3
      .scaleOrdinal(d3.schemeTableau10)
      .domain(selectedFavorites.map((favoriteSearch) => favoriteSearch.id));
    const comparisonGroups = this.getComparisonGroups(
      selectedFavorites,
      colorScale,
    );

    return (
      <Wrapper visible={visible}>
        {this.renderComparisonControls(selectedFavorites, colorScale)}
        <Card
          style={transitionStyle(inViewport)}
          loading={loading}
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <LuChartNoAxesGantt />
              </span>
              <span className="ant-pro-menu-item-title">
                <span
                  dangerouslySetInnerHTML={{
                    __html:
                      title || t("components.parallel-coordinates-panel.title"),
                  }}
                />
              </span>
            </Space>
          }
          extra={
            <Space>
              <Tooltip title={t("components.download-as-png-tooltip")}>
                <Button
                  type="default"
                  shape="circle"
                  disabled={!visible}
                  icon={<AiOutlineDownload style={{ marginTop: 4 }} />}
                  size="small"
                  onClick={() => this.onDownloadButtonClicked()}
                />
              </Tooltip>
            </Space>
          }
        >
          {visible && (
            <div
              className="ant-wrapper"
              ref={(elem) => (this.container = elem)}
            >
              <ContainerDimensions>
                {({ width, height }) => {
                  return (
                    inViewport && (
                      <Row style={{ width }} gutter={[margins.gap, 0]}>
                        <Col flex={1}>
                          <ParallelCoordinatesPlot
                            {...{
                              id,
                              width,
                              height,
                              data,
                              comparisonGroups,
                              handleCardClick,
                            }}
                          />
                        </Col>
                      </Row>
                    )
                  );
                }}
              </ContainerDimensions>
            </div>
          )}
        </Card>
      </Wrapper>
    );
  }
}
ParallelCoordinatesPanel.propTypes = {
  comparisonCohorts: PropTypes.object,
  comparisonCohortsLoading: PropTypes.object,
  data: PropTypes.array,
  favoriteSearches: PropTypes.array,
  fetchCohortStatistics: PropTypes.func.isRequired,
  visible: PropTypes.bool,
  handleCardClick: PropTypes.func,
};
ParallelCoordinatesPanel.defaultProps = {
  comparisonCohorts: {},
  comparisonCohortsLoading: {},
  data: [],
  favoriteSearches: [],
  visible: true,
  handleCardClick: null,
};
const mapDispatchToProps = (dispatch) => ({
  fetchCohortStatistics: (searchId, options) =>
    dispatch(fetchCohortStatistics(searchId, options)),
});
const mapStateToProps = (state) => ({
  favoriteSearches: state.CaseReports.favoriteSearches,
  comparisonCohorts: state.PopulationStatistics.comparisonCohorts,
  comparisonCohortsLoading: state.PopulationStatistics.comparisonCohortsLoading,
  loading: state.PopulationStatistics.cohortsLoading,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(
  withTranslation("common")(
    handleViewport(ParallelCoordinatesPanel, { rootMargin: "-1.0px" }),
  ),
);
