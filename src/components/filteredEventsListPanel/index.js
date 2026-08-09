import { Component } from "react";
import { createPortal } from "react-dom";
import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
import handleViewport from "react-in-viewport";
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
  Select,
  Checkbox,
} from "antd";
import * as d3 from "d3";
import { roleColorMap, transitionStyle } from "../../helpers/utility";
import TracksModal from "../tracksModal";
import Wrapper from "./index.style";
import { CgArrowsBreakeH } from "react-icons/cg";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import interpretationsActions from "../../redux/interpretations/actions";
import {
  getTierCountsByExactEventKey,
  selectMergedEvents,
} from "../../redux/interpretations/selectors";
import { createExactEventKey } from "../../helpers/interpretationHistory";
import { selectReportEventUids } from "../../redux/filteredEvents/selectors";
import EventInterpretation from "../../helpers/EventInterpretation";
import ErrorPanel from "../errorPanel";
import ReportModal from "../reportModal";
import TierDistributionBarChart from "../tierDistributionBarChart";
import { buildColumnsFromSettings } from "./columnBuilders";
import getDefaultVisibleFilteredEventsColumnKeys from "./defaultVisibleFilteredEventsColumns";
import ResizableTitle, {
  clampColumnWidth,
  makeColumnsResizable,
} from "./resizableTitle";

const { selectFilteredEvent, setSelectedEventUids, setColumnFilters, resetColumnFilters } = filteredEventsActions;

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

export class FilteredEventsListPanel extends Component {
  handleResetFilters = () => {
    const { resetColumnFilters } = this.props;

    resetColumnFilters();
    this.setState({
      selectedColumnKeys: this.getDefaultColumnKeys(),
    });
  };

  handleCheckboxChange = (record, checked) => {
    if (record?.uid == null) return;

    const { selectedEventUids, setSelectedEventUids } = this.props;
    if (checked) {
      setSelectedEventUids([
        ...new Set([...selectedEventUids, record.uid]),
      ]);
      return;
    }

    setSelectedEventUids(
      selectedEventUids.filter((uid) => uid !== record.uid)
    );
  };

  getSelectableEventUids = (records) => [
    ...new Set(
      (records || [])
        .filter((record) => record?.uid != null)
        .map((record) => record.uid)
    ),
  ];

  getRecordsMatchingColumnFilters = (records, columns) => {
    const activeFilters = (columns || []).filter(
      (column) =>
        Array.isArray(column.filteredValue) &&
        column.filteredValue.length > 0 &&
        typeof column.onFilter === "function"
    );

    return (records || []).filter((record) =>
      activeFilters.every((column) =>
        column.filteredValue.some((value) => column.onFilter(value, record))
      )
    );
  };

  handleHeaderCheckboxChange = (records) => {
    const { selectedEventUids, setSelectedEventUids } = this.props;
    const selectableUids = this.getSelectableEventUids(records);
    if (selectableUids.length === 0) return;

    const selectedUids = selectableUids.filter((uid) =>
      selectedEventUids.includes(uid)
    );
    const allSelected =
      selectedUids.length === selectableUids.length &&
      selectableUids.length > 0;

    if (allSelected) {
      setSelectedEventUids(
        selectedEventUids.filter((uid) => !selectableUids.includes(uid))
      );
      return;
    }

    setSelectedEventUids([
      ...new Set([...selectedEventUids, ...selectableUids]),
    ]);
  };

  getHeaderCheckboxState = (records) => {
    const { selectedEventUids } = this.props;
    const selectableUids = this.getSelectableEventUids(records);

    if (selectableUids.length === 0) {
      return { checked: false, indeterminate: false };
    }

    const selectedUids = selectableUids.filter((uid) =>
      selectedEventUids.includes(uid)
    );

    if (selectedUids.length === 0) {
      return { checked: false, indeterminate: false };
    }
    if (selectedUids.length === selectableUids.length) {
      return { checked: true, indeterminate: false };
    }
    return { checked: false, indeterminate: true };
  };

  isEventSelected = (record) => {
    if (record?.uid == null) return false;

    const { selectedEventUids } = this.props;
    return selectedEventUids.includes(record.uid);
  };
  state = {
    eventType: "all",
    selectedColumnKeys: [],
    sortState: {
      columnKey: null,
      order: null,
    },
    columnWidths: {},
  };

  getDefaultColumnKeys = (props = this.props) => {
    const { additionalColumns, data: settingsData, dataset } = props;

    // Get columns from settings.json
    const settingsColumns = settingsData?.filteredEventsColumns || [];
    const settingsColumnIds = (
      Array.isArray(settingsColumns) ? settingsColumns : []
    )
      .map((col) => col?.id)
      .filter(Boolean);

    // Get optional columns from current dataset
    // Safely handles cases where optionalFilteredEventsColumns attribute is missing or undefined
    const datasetColumns = dataset?.optionalFilteredEventsColumns || [];
    const datasetColumnIds = (
      Array.isArray(datasetColumns) ? datasetColumns : []
    )
      .map((col) => col?.id)
      .filter(Boolean);

    // Merge: settings columns first, then dataset-specific columns
    const mergedColumnIds = [
      ...new Set([...settingsColumnIds, ...datasetColumnIds]),
    ];
    const additionalColumnIds = (additionalColumns || []).map(
      (column) => column.key,
    );

    return getDefaultVisibleFilteredEventsColumnKeys(
      mergedColumnIds,
      dataset?.defaultVisibleFilteredEventsColumns,
      additionalColumnIds,
    );
  };

  getColumnConfigurationSignature = (props = this.props) => {
    const settingsColumnIds = (props.data?.filteredEventsColumns || [])
      .map((column) => column?.id)
      .filter(Boolean);
    const datasetColumnIds = (props.dataset?.optionalFilteredEventsColumns || [])
      .map((column) => column?.id)
      .filter(Boolean);
    const defaultVisibleColumnIds = Array.isArray(
      props.dataset?.defaultVisibleFilteredEventsColumns,
    )
      ? props.dataset.defaultVisibleFilteredEventsColumns
      : null;
    const additionalColumnIds = (props.additionalColumns || [])
      .map((column) => column?.key)
      .filter(Boolean);

    return JSON.stringify([
      settingsColumnIds,
      datasetColumnIds,
      defaultVisibleColumnIds,
      additionalColumnIds,
    ]);
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

  handleTierChange = async (record, tier) => {
    const { id, dataset, updateInterpretation } = this.props;
    const { ensureUser } = await import("../../helpers/userAuth");

    try {
      await ensureUser();
    } catch (error) {
      return;
    }

    const interpretation = new EventInterpretation({
      datasetId: dataset?.id,
      caseId: id || record?.id || "UNKNOWN",
      alterationId: record?.uid || "UNKNOWN",
      gene: record?.gene,
      variant: record?.variant,
      variant_type: record?.type,
      data: { tier: String(tier) },
    });

    updateInterpretation(interpretation.toJSON());
  };

  componentDidMount() {
    this.initializeSelectedColumns();
  }

  componentDidUpdate(prevProps) {
    if (
      this.getColumnConfigurationSignature(prevProps) !==
      this.getColumnConfigurationSignature(this.props)
    ) {
      this.initializeSelectedColumns();
    }
  }

  initializeSelectedColumns = () => {
    this.setState({ selectedColumnKeys: this.getDefaultColumnKeys() });
  };

  handleColumnResize = (columnKey) => (_, { size }) => {
    if (!Number.isFinite(size?.width)) return;

    this.setState(({ columnWidths }) => ({
      columnWidths: {
        ...columnWidths,
        [columnKey]: clampColumnWidth(size.width),
      },
    }));
  };

  handleTableChange = (pagination, filters, sorter) => {
    const columnFilters = {};
    Object.keys(filters).forEach((key) => {
      if (filters[key] && filters[key].length > 0) {
        columnFilters[key] = filters[key];
      }
    });

    const sortState = {
      columnKey: sorter?.columnKey || null,
      order: sorter?.order || null,
    };

    this.props.setColumnFilters(columnFilters);
    this.setState({ sortState });
  };

  getTierTooltipContent = (record) => {
    const { interpretationsStatus, tierCountsByEvent = {} } = this.props;
    if (interpretationsStatus === "pending") {
      return "Loading tier distribution...";
    }

    const eventKey = createExactEventKey(record);
    const tierCounts = tierCountsByEvent[eventKey] || { 1: 0, 2: 0, 3: 0 };
    const total =
      (tierCounts[1] || 0) + (tierCounts[2] || 0) + (tierCounts[3] || 0);
    if (total === 0) {
      return "No retiering found for this gene variant";
    }
    const originalRecord = this.props.originalFilteredEvents.find(
      (r) => r.uid === record.uid
    );
    const originalTier = originalRecord?.tier || 3;
    return (
      <TierDistributionBarChart
        width={300}
        height={150}
        tierCounts={tierCounts}
        originalTier={originalTier}
        gene={record.gene}
        variantType={record.type}
        variant={record.variant}
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
      missing,
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
      data,
      dataset,
      inViewport,
    } = this.props;

    if (missing) return null;

    let open = selectedFilteredEvent?.id;

    let {
      eventType,
      selectedColumnKeys,
      sortState,
      columnWidths,
    } = this.state;

    let recordsHash = d3.group(filteredEvents, (d) => d.eventType);
    let records =
      (eventType === "all" ? filteredEvents : recordsHash.get(eventType)) || [];

    const { columnFilters } = this.props;
    const filterValues = { ...columnFilters };

    // Build columns from settings.json and dataset configuration
    const columns = buildColumnsFromSettings(
      data?.filteredEventsColumns || [],
      dataset?.optionalFilteredEventsColumns || [],
      records,
      {
        t,
        selectFilteredEvent,
        getTierTooltipContent: this.getTierTooltipContent,
        onTierChange: this.handleTierChange,
      },
      filterValues
    );

    const columnsWithSortState = columns.map((col) => {
      if (!col.sorter) return col;
      return {
        ...col,
        sortOrder: sortState.columnKey === col.key ? sortState.order : null,
      };
    });

    const selectedDataColumns = [
      ...(additionalColumns || []),
      ...columnsWithSortState,
    ].filter((column) => selectedColumnKeys.includes(column.key));
    const filteredRecords = this.getRecordsMatchingColumnFilters(
      records,
      selectedDataColumns
    );
    const headerCheckboxState = this.getHeaderCheckboxState(filteredRecords);
    const checkboxColumn = {
      title: (
        <Checkbox
          checked={headerCheckboxState.checked}
          disabled={this.getSelectableEventUids(filteredRecords).length === 0}
          indeterminate={headerCheckboxState.indeterminate}
          onChange={() => this.handleHeaderCheckboxChange(filteredRecords)}
        >
          {t("components.filtered-events-panel.add-to-report")}
        </Checkbox>
      ),
      key: "select",
      width: 150,
      fixed: "left",
      align: "center",
      render: (_, record) => (
        <Checkbox
          checked={this.isEventSelected(record)}
          disabled={record?.uid == null}
          onChange={(event) =>
            this.handleCheckboxChange(record, event.target.checked)
          }
        />
      ),
    };
    const resizableColumns = makeColumnsResizable(
      selectedDataColumns,
      columnWidths,
      this.handleColumnResize
    );
    const visibleColumns = [checkboxColumn, ...resizableColumns];
    const tableScrollWidth = visibleColumns.reduce(
      (total, column) => total + (Number(column.width) || 0),
      0
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
          <div>
            <Row
              className="ant-panel-container ant-home-plot-container"
              align="middle"
              justify="space-between"
              style={transitionStyle(inViewport)}
            >
              {inViewport && (
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
              )}
              {inViewport && (
                <Col style={{ textAlign: "right" }} flex="none">
                  <Button
                    type="link"
                    onClick={this.handleResetFilters}
                    className="reset-filters-btn"
                  >
                    {t("components.filtered-events-panel.reset-filters")}
                  </Button>
                </Col>
              )}
            </Row>
            <Row
              className="ant-panel-container ant-home-plot-container"
              align="middle"
              justify="space-between"
              style={{ marginBottom: "12px", ...transitionStyle(inViewport) }}
            >
              {inViewport && (
                <Col flex="auto">
                  <Select
                    mode="multiple"
                    placeholder={t(
                      "components.filtered-events-panel.select-columns"
                    )}
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
              )}
            </Row>
            {/* Hide table when TracksModal is open to prevent performance issues */}
            {!(selectedFilteredEvent && viewMode === "tracks") && (
              <Row
                className="ant-panel-container ant-home-plot-container"
                style={transitionStyle(inViewport)}
              >
                {inViewport && (
                  <Col className="gutter-row table-container" span={24}>
                    <Skeleton active loading={loading}>
                      <Table
                        components={{ header: { cell: ResizableTitle } }}
                        columns={visibleColumns}
                        dataSource={records}
                        pagination={{ pageSize: 50 }}
                        showSorterTooltip={false}
                        onChange={this.handleTableChange}
                        scroll={{ x: tableScrollWidth || "100%", y: 500 }}
                        tableLayout="fixed"
                      />
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
                  </Col>
                )}
              </Row>
            )}
            {selectedFilteredEvent && viewMode === "tracks" && createPortal(
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
              />,
              document.body
            )}
          </div>
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
  setSelectedEventUids: (uids) =>
    dispatch(setSelectedEventUids(uids)),
  setColumnFilters: (columnFilters) =>
    dispatch(setColumnFilters(columnFilters)),
  resetColumnFilters: () =>
    dispatch(resetColumnFilters()),
  updateInterpretation: (interpretation) =>
    dispatch(interpretationsActions.updateInterpretation(interpretation)),
});
const mapStateToProps = (state) => {
  const mergedEvents = selectMergedEvents(state);
  const tierCountsByEvent = getTierCountsByExactEventKey(state);

  return {
    loading: state.FilteredEvents.loading,
    filteredEvents: mergedEvents.filteredEvents,
    originalFilteredEvents: state.FilteredEvents.originalFilteredEvents,
    selectedFilteredEvent: mergedEvents.selectedFilteredEvent,
    selectedEventUids: selectReportEventUids(state),
    columnFilters: state.FilteredEvents.columnFilters || { tier: [1, 2] },
    viewMode: state.FilteredEvents.viewMode,
    error: state.FilteredEvents.error,
    missing: state.FilteredEvents.missing,
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
    interpretationsStatus: state.Interpretations?.status,
    tierCountsByEvent,
    dataset: state?.Settings?.dataset,
    data: state?.Settings?.data,
  };
};
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withRouter(
    withTranslation("common")(
      handleViewport(FilteredEventsListPanel, { rootMargin: "-1.0px" })
    )
  )
);
