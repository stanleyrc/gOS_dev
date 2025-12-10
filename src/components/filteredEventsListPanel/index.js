import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
import { connect } from "react-redux";
import {
  Tag,
  Table,
  Button,
  Space,
  Row,
  Col,
  Segmented,
  Skeleton,
  Tooltip,
  Avatar,
  Typography,
  Select,
} from "antd";
import * as d3 from "d3";
import { roleColorMap } from "../../helpers/utility";
import TracksModal from "../tracksModal";
import Wrapper from "./index.style";
import { CgArrowsBreakeH } from "react-icons/cg";
import { InfoCircleOutlined } from "@ant-design/icons";
import filteredEventsActions from "../../redux/filteredEvents/actions";

import { selectMergedEvents, getAllInterpretationsForAlteration } from "../../redux/interpretations/selectors";
import { store } from "../../redux/store";
import ErrorPanel from "../errorPanel";
import ReportModal from "../reportModal";
import InterpretationsAvatar from "../interpretationsAvatar";
import EventInterpretation from "../../helpers/EventInterpretation";
import TierDistributionBarChart from "../tierDistributionBarChart";
import { buildColumnsFromSettings } from "./columnBuilders";

const { Text } = Typography;

const { selectFilteredEvent } = filteredEventsActions;

const EVENT_TYPES = ["all", "snv", "cna", "fusion", "complexsv"];

// Helper function to extract text from column title (handles both strings and JSX)
const getColumnTitle = (title) => {
  if (typeof title === "string") return title;
  if (typeof title === "object" && title?.props?.children) {
    // Handle Text component with children
    const children = Array.isArray(title.props.children)
      ? title.props.children[title.props.children.length - 1]
      : title.props.children;
    return typeof children === "string" ? children : "Column";
  }
  return "Column";
};

class FilteredEventsListPanel extends Component {

  handleResetFilters = () => {
    const { additionalColumns } = this.props;
    const defaultColumnKeys = this.getDefaultColumnKeys();
    const additionalKeys = (additionalColumns || []).map((col) => col.key);
    const defaultKeys = [...new Set([...defaultColumnKeys, ...additionalKeys])];
    this.setState({
      geneFilters: [],
      tierFilters: [],
      typeFilters: [],
      roleFilters: [],
      effectFilters: [],
      variantFilters: [],
      selectedColumnKeys: defaultKeys,
    });
  };
  state = {
    eventType: "all",
    tierFilters: [1, 2], // start with tiers 1 & 2 checked
    typeFilters: [],
    roleFilters: [],
    effectFilters: [],
    variantFilters: [],
    geneFilters: [],
    tierCountsMap: {},
    selectedColumnKeys: [],
  };

  // add as a class field

  getDefaultColumnKeys = () => {
    const { data: settingsData, dataset } = this.props;
    
    // Get columns from settings.json
    const settingsColumns = settingsData?.filteredEventsColumns || [];
    const settingsColumnIds = (Array.isArray(settingsColumns) ? settingsColumns : [])
      .map((col) => col?.id)
      .filter(Boolean);
    
    // Get optional columns from current dataset
    // Safely handles cases where optionalFilteredEventsColumns attribute is missing or undefined
    const datasetColumns = dataset?.optionalFilteredEventsColumns || [];
    const datasetColumnIds = (Array.isArray(datasetColumns) ? datasetColumns : [])
      .map((col) => col?.id)
      .filter(Boolean);
    
    // Merge: settings columns first, then dataset-specific columns
    const mergedColumnIds = [...new Set([...settingsColumnIds, ...datasetColumnIds])];
    return mergedColumnIds;
  };

  handleCloseReportModal = async () => {
    this.props.selectFilteredEvent(null);
  };

  handleSegmentedChange = (eventType) => {
    this.setState({ eventType });
  };

  handleColumnSelectionChange = (selectedKeys) => {
    this.setState({ selectedColumnKeys: selectedKeys });
  };

  componentDidMount() {
    this.fetchTierCountsForRecords();
    this.initializeSelectedColumns();
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.filteredEvents !== this.props.filteredEvents || prevState.eventType !== this.state.eventType) {
      this.fetchTierCountsForRecords();
    }
    if (prevProps.additionalColumns !== this.props.additionalColumns ||
        prevProps.data !== this.props.data ||
        prevProps.dataset !== this.props.dataset) {
      this.initializeSelectedColumns();
    }
  }

  initializeSelectedColumns = () => {
    const { additionalColumns } = this.props;
    const defaultColumnKeys = this.getDefaultColumnKeys();
    const additionalKeys = (additionalColumns || []).map((col) => col.key);
    const selectedKeys = [...new Set([...defaultColumnKeys, ...additionalKeys])];
    this.setState({ selectedColumnKeys: selectedKeys });
  };

  handleTableChange = (pagination, filters, sorter) => {
    // When the user changes filters (e.g. checks tier 3),
    // update tierFilters in the state:
    this.setState({
      geneFilters: filters.gene || [],
      tierFilters: filters.tier || [],
      typeFilters: filters.type || [],
      roleFilters: filters.role || [],
      effectFilters: filters.effect || [],
      variantFilters: filters.variant || [],
    });
  };

  fetchTierCountsForRecords = async () => {
    const { filteredEvents } = this.props;
    const { eventType } = this.state;
    let recordsHash = d3.group(
      filteredEvents.filter((d) => (d.tier && +d.tier < 3) || d.eventType === "complexsv"),
      (d) => d.eventType
    );
    let records = (eventType === "all" ? filteredEvents : recordsHash.get(eventType)) || [];
    const { dataset } = this.props;
    const map = {};
    const promises = records.map(async (record) => {
      if (!record.gene || !record.type) return;
      const key = `${record.gene}-${record.type}`;
      if (map[key]) return; // already fetching
      try {
        const { getActiveRepository } = await import('../../services/repositories');
        const repository = getActiveRepository({ dataset });
        const counts = await repository.getTierCountsByGeneVariantType(record.gene, record.type);
        map[key] = counts;
      } catch (error) {
        console.error('Failed to fetch tier counts:', error);
        map[key] = {1: 0, 2: 0, 3: 0};
      }
    });
    await Promise.all(promises);
    this.setState({ tierCountsMap: map });
  };

  getTierTooltipContent = (record) => {
    const key = `${record.gene}-${record.type}`;
    const tierCounts = this.state.tierCountsMap[key];
    if (!tierCounts) return 'Loading tier distribution...';
    const total = (tierCounts[1] || 0) + (tierCounts[2] || 0) + (tierCounts[3] || 0);
    if (total === 0) {
      return 'No retiering found for this gene variant';
    }
    const originalRecord = this.props.originalFilteredEvents.find(r => r.uid === record.uid);
    const originalTier = originalRecord?.tier || 3;
    return (
      <TierDistributionBarChart
        width={300}
        height={150}
        tierCounts={tierCounts}
        originalTier={originalTier}
        gene={record.gene}
        variantType={record.type}
      />
    );
  };

  render() {
    const {
      t,
      id,
      filteredEvents,
      selectedFilteredEvent,
      viewMode,
      loading,
      error,
      genome,
      mutations,
      chromoBins,
      genomeCoverage,
      methylationBetaCoverage,
      methylationIntensityCoverage,
      hetsnps,
      genes,
      allelic,
      igv,
      selectFilteredEvent,
      additionalColumns,
      additionalColumnIndices,
      data,
      dataset,
    } = this.props;

    let open = selectedFilteredEvent?.id;

    let {
      eventType,
      tierFilters,
      typeFilters,
      geneFilters,
      roleFilters,
      effectFilters,
      variantFilters,
      selectedColumnKeys,
    } = this.state;

    let recordsHash = d3.group(
      filteredEvents.filter((d) => (d.tier && +d.tier < 3) || d.eventType === "complexsv"),
      (d) => d.eventType
    );
    let records =
      (eventType === "all" ? filteredEvents : recordsHash.get(eventType)) || [];

    const roleInCancerLabel = t("components.filtered-events-panel.role");
    const effectLabel = t("components.filtered-events-panel.effect");

    // Build columns from settings.json and dataset configuration
    const columns = buildColumnsFromSettings(
      data?.filteredEventsColumns || [],
      dataset?.optionalFilteredEventsColumns || [],
      records,
      {
        t,
        selectFilteredEvent,
        getTierTooltipContent: this.getTierTooltipContent,
      }
    );

    return (
      <Wrapper>
        {error ? (
          <Row className="ant-panel-container ant-home-plot-container">
            <Col className="gutter-row table-container" span={24}>
              <ErrorPanel
                avatar={<CgArrowsBreakeH />}
                header={t("components.filtered-events-panel.header")}
                title={t("components.filtered-events-panel.error.title", {
                  id,
                })}
                subtitle={t("components.filtered-events-panel.error.subtitle")}
                explanationTitle={t(
                  "components.filtered-events-panel.error.explanation.title"
                )}
                explanationDescription={error.stack}
              />
            </Col>
          </Row>
        ) : (
          <>
            <Row
              className="ant-panel-container ant-home-plot-container"
              align="middle"
              justify="space-between"
            >
              <Col flex="auto">
                <Segmented
                  size="small"
                  options={EVENT_TYPES.map((d) => {
                    return {
                      label: (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: t(
                              "components.filtered-events-panel.event",
                              {
                                eventType: t(
                                  `components.filtered-events-panel.event-types.${d}`
                                ),
                                count: (d === "all"
                                  ? filteredEvents
                                  : recordsHash.get(d) || []
                                ).length,
                              }
                            ),
                          }}
                        />
                      ),
                      value: d,
                      disabled:
                        (d === "all"
                          ? filteredEvents
                          : recordsHash.get(d) || []
                        ).length === 0,
                    };
                  })}
                  onChange={(d) => this.handleSegmentedChange(d)}
                  value={eventType}
                />
              </Col>
              <Col style={{ textAlign: "right" }} flex="none">
                <Button
                  type="link"
                  onClick={this.handleResetFilters}
                  className="reset-filters-btn"
                >
                  {t("components.filtered-events-panel.reset-filters")}
                </Button>
              </Col>
            </Row>
            <Row
              className="ant-panel-container ant-home-plot-container"
              align="middle"
              justify="space-between"
              style={{ marginBottom: "12px" }}
            >
              <Col flex="auto">
                <Select
                   mode="multiple"
                   placeholder={t("components.filtered-events-panel.select-columns")}
                   value={selectedColumnKeys}
                   onChange={this.handleColumnSelectionChange}
                   style={{ width: "50%" }}
                   size="small"
                   maxTagCount="responsive"
                 >
                   {columns.map((col) => (
                     <Select.Option key={col.key} value={col.key}>
                       {getColumnTitle(col.title)}
                     </Select.Option>
                   ))}
                   {(additionalColumns || []).map((col) => (
                     <Select.Option key={col.key} value={col.key}>
                       {getColumnTitle(col.title)}
                     </Select.Option>
                   ))}
                 </Select>
              </Col>
            </Row>
            <Row className="ant-panel-container ant-home-plot-container">
              <Col className="gutter-row table-container" span={24}>
                {
                  <Skeleton active loading={loading}>
                    <Table
                       columns={[
                         ...(additionalColumns || []),
                         ...columns
                       ].filter((col) => selectedColumnKeys.includes(col.key))}
                      dataSource={records}
                      pagination={{ pageSize: 50 }}
                      showSorterTooltip={false}
                      onChange={this.handleTableChange}
                      scroll={{ x: "100%", y: 500 }}
                      tableLayout="fixed"
                    />
                    {selectedFilteredEvent && viewMode === "tracks" && (
                      <TracksModal
                        {...{
                          showVariants: true,
                          selectedVariantId: selectedFilteredEvent.uid,
                          loading,
                          genome,
                          mutations,
                          genomeCoverage,
                          methylationBetaCoverage,
                          methylationIntensityCoverage,
                          hetsnps,
                          genes,
                          igv,
                          chromoBins,
                          allelic,
                          modalTitleText: selectedFilteredEvent.gene,
                          modalTitle: (
                            <Space>
                              {selectedFilteredEvent.gene}
                              {selectedFilteredEvent.name}
                              {selectedFilteredEvent.type}
                              {selectedFilteredEvent.role
                                ?.split(",")
                                .map((tag) => (
                                  <Tag
                                    color={roleColorMap()[tag.trim()]}
                                    key={tag.trim()}
                                  >
                                    {tag.trim()}
                                  </Tag>
                                ))}
                              {selectedFilteredEvent.tier}
                              {selectedFilteredEvent.location}
                            </Space>
                          ),
                          genomePlotTitle: t(
                            "components.tracks-modal.genome-plot"
                          ),
                          genomePlotYAxisTitle: t(
                            "components.tracks-modal.genome-y-axis-title"
                          ),
                          coveragePlotTitle: t(
                            "components.tracks-modal.coverage-plot"
                          ),
                          coverageYAxisTitle: t(
                            "components.tracks-modal.coverage-copy-number"
                          ),
                          coverageYAxis2Title: t(
                            "components.tracks-modal.coverage-count"
                          ),
                          methylationBetaCoveragePlotTitle: t(
                            "components.tracks-modal.methylation-beta-coverage-plot"
                          ),
                          methylationBetaCoverageYAxisTitle: t(
                            "components.tracks-modal.methylation-beta-coverage-y-axis-title"
                          ),
                          methylationBetaCoverageYAxis2Title: t(
                            "components.tracks-modal.methylation-beta-coverage-y-axis2-title"
                          ),
                          methylationIntensityCoveragePlotTitle: t(
                            "components.tracks-modal.methylation-intensity-coverage-plot"
                          ),
                          methylationIntensityCoverageYAxisTitle: t(
                            "components.tracks-modal.methylation-intensity-coverage-y-axis-title"
                          ),
                          methylationIntensityCoverageYAxis2Title: t(
                            "components.tracks-modal.methylation-intensity-coverage-y-axis2-title"
                          ),
                          hetsnpPlotTitle: t(
                            "components.tracks-modal.hetsnp-plot"
                          ),
                          hetsnpPlotYAxisTitle: t(
                            "components.tracks-modal.hetsnp-copy-number"
                          ),
                          hetsnpPlotYAxis2Title: t(
                            "components.tracks-modal.hetsnps-count"
                          ),
                          mutationsPlotTitle: t(
                            "components.tracks-modal.mutations-plot"
                          ),
                          mutationsPlotYAxisTitle: t(
                            "components.tracks-modal.mutations-plot-y-axis-title"
                          ),
                          allelicPlotTitle: t(
                            "components.tracks-modal.allelic-plot"
                          ),
                          allelicPlotYAxisTitle: t(
                            "components.tracks-modal.allelic-plot-y-axis-title"
                          ),
                          handleOkClicked: () => selectFilteredEvent(null),
                          handleCancelClicked: () => selectFilteredEvent(null),
                          open,
                        }}
                      />
                    )}
                    {selectedFilteredEvent && viewMode === "detail" && (
                      <ReportModal
                        open
                        onClose={this.handleCloseReportModal}
                        title={
                          <Space>
                            {selectedFilteredEvent.gene}
                            {selectedFilteredEvent.name}
                            {selectedFilteredEvent.type}
                            {selectedFilteredEvent.role
                              ?.split(",")
                              .map((tag) => (
                                <Tag
                                  color={roleColorMap()[tag.trim()]}
                                  key={tag.trim()}
                                >
                                  {tag.trim()}
                                </Tag>
                              ))}
                            {selectedFilteredEvent.tier}
                            {selectedFilteredEvent.location}
                          </Space>
                        }
                        loading={loading}
                        genome={genome}
                        mutations={mutations}
                        genomeCoverage={genomeCoverage}
                        methylationBetaCoverage={methylationBetaCoverage}
                        methylationIntensityCoverage={
                          methylationIntensityCoverage
                        }
                        hetsnps={hetsnps}
                        genes={genes}
                        igv={igv}
                        chromoBins={chromoBins}
                        allelic={allelic}
                        selectedVariantId={selectedFilteredEvent?.uid}
                        showVariants
                        record={selectedFilteredEvent}
                      />
                    )}
                  </Skeleton>
                }
              </Col>
            </Row>

          </>
        )}
      </Wrapper>
    );
  }
}
FilteredEventsListPanel.propTypes = {};
FilteredEventsListPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  selectFilteredEvent: (filteredEvent, viewMode) =>
    dispatch(selectFilteredEvent(filteredEvent, viewMode)),
});
const mapStateToProps = (state) => {
  const mergedEvents = selectMergedEvents(state);

  return {
    loading: state.FilteredEvents.loading,
    filteredEvents: mergedEvents.filteredEvents,
    originalFilteredEvents: state.FilteredEvents.originalFilteredEvents,
    selectedFilteredEvent: mergedEvents.selectedFilteredEvent,
    viewMode: state.FilteredEvents.viewMode,
    error: state.FilteredEvents.error,
    id: state.CaseReport.id,
    report: state.CaseReport.metadata,
    genome: state.Genome,
    mutations: state.Mutations,
    allelic: state.Allelic,
    chromoBins: state.Settings.chromoBins,
    genomeCoverage: state.GenomeCoverage,
    methylationBetaCoverage: state.MethylationBetaCoverage,
    methylationIntensityCoverage: state.MethylationIntensityCoverage,
    hetsnps: state.Hetsnps,
    genes: state.Genes,
    igv: state.Igv,
    CaseReport: state.CaseReport,
    Interpretations: state.Interpretations,
    dataset: state?.Settings?.dataset,
    data: state?.Settings?.data,
  };
};
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(FilteredEventsListPanel)));
