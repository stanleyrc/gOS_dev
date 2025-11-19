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
} from "antd";
import { FileTextOutlined, EyeOutlined } from "@ant-design/icons";
import { BsDashLg } from "react-icons/bs";
import * as d3 from "d3";
import { ArrowRightOutlined } from "@ant-design/icons";
import { roleColorMap, tierColor } from "../../helpers/utility";
import TracksModal from "../tracksModal";
import Wrapper from "./index.style";
import { CgArrowsBreakeH } from "react-icons/cg";
import { InfoCircleOutlined } from "@ant-design/icons";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import interpretationsActions from "../../redux/interpretations/actions";
import { selectMergedEvents, getAllInterpretationsForAlteration } from "../../redux/interpretations/selectors";
import { store } from "../../redux/store";
import ErrorPanel from "../errorPanel";
import ReportModal from "../reportModal";
import ReportPreviewModal from "../reportPreviewModal";
import InterpretationsAvatar from "../InterpretationsAvatar";
import { exportReport, previewReport } from "../../helpers/reportExporter";
import EventInterpretation from "../../helpers/EventInterpretation";
import TierDistributionBarChart from "../tierDistributionBarChart";

const { Text } = Typography;

const { selectFilteredEvent, resetTierOverrides } = filteredEventsActions;

const eventColumns = {
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  snv: [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
  cna: [0, 1, 2, 3, 4, 5, 7, 12],
  fusion: [0, 1, 2, 3, 4, 5, 8, 12],
};

class FilteredEventsListPanel extends Component {
  constructor(props) {
    super(props);
    this.fileInputRef = React.createRef();
  }

  handleResetFilters = () => {
    this.setState({
      geneFilters: [],
      tierFilters: [],
      typeFilters: [],
      roleFilters: [],
      effectFilters: [],
      variantFilters: [],
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
    exporting: false,
    previewVisible: false,
    previewHtml: null,
    previewLoading: false,
    tierCountsMap: {},
  };

  // add as a class field

  handleExportNotes = async () => {
    const { mergedEvents } = this.props;
    try {
      this.setState({ exporting: true });
      // Get the full Redux state
      const state = this.props;
      await exportReport(state, mergedEvents);
    } catch (err) {
      console.error("Report export failed:", err);
    } finally {
      this.setState({ exporting: false });
    }
  };

  handlePreviewReport = async () => {
    const { mergedEvents } = this.props;
    try {
      this.setState({ previewLoading: true, previewVisible: true });
      const state = this.props;
      const html = await previewReport(state, mergedEvents);
      this.setState({ previewHtml: html });
    } catch (err) {
      console.error("Report preview failed:", err);
      this.setState({ previewVisible: false });
    } finally {
      this.setState({ previewLoading: false });
    }
  };

  handleClosePreview = () => {
    this.setState({ previewVisible: false, previewHtml: null });
  };

  handleLoadReport = async () => {
    this.fileInputRef.current.click();
  };

  handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const script = doc.getElementById('interpretations-data');
      if (!script) {
        throw new Error('No interpretations-data script found in HTML');
      }
      const interpretationsData = JSON.parse(script.textContent);

      // Validate caseId
      const currentCaseId = this.props.id;
      if (!currentCaseId) {
        throw new Error('No current case loaded');
      }
      for (const interp of interpretationsData) {
        if (interp.caseId !== currentCaseId) {
          throw new Error(`Case ID mismatch: expected ${currentCaseId}, got ${interp.caseId}`);
        }
      }

      // Create EventInterpretation objects and dispatch
      for (const interpData of interpretationsData) {
        const interpretation = new EventInterpretation(interpData);
        this.props.updateInterpretation(interpretation);
      }

      alert(`Successfully imported ${interpretationsData.length} interpretations`);
    } catch (error) {
      console.error('Error importing report:', error);
      alert(`Failed to import report: ${error.message}`);
    } finally {
      // Reset the input
      event.target.value = '';
    }
  };

  handleResetReportState = async () => {
    const { id, resetTierOverrides, selectFilteredEvent } = this.props;
    const caseId = id ? String(id) : "";
    if (!caseId) {
      alert(
        this.props.t(
          "components.filtered-events-panel.reset-prompts.no-case-id"
        )
      );
      return;
    }
    const c1 = window.confirm(
      this.props.t("components.filtered-events-panel.reset-prompts.confirm1")
    );
    if (!c1) return;
    const c2 = window.confirm(
      this.props.t("components.filtered-events-panel.reset-prompts.confirm2")
    );
    if (!c2) return;

    // Clear interpretations from IndexedDB
    this.props.clearCaseInterpretations(caseId);

    // Reset Redux state
    resetTierOverrides();
    selectFilteredEvent(null);
  };

  handleCloseReportModal = async () => {
    this.props.selectFilteredEvent(null);
  };

  handleSegmentedChange = (eventType) => {
    this.setState({ eventType });
  };

  componentDidMount() {
    this.fetchTierCountsForRecords();
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.filteredEvents !== this.props.filteredEvents || prevState.eventType !== this.state.eventType) {
      this.fetchTierCountsForRecords();
    }
  }

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
      filteredEvents.filter((d) => d.tier && +d.tier < 3),
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
        width={200}
        height={150}
        tierCounts={tierCounts}
        originalTier={originalTier}
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
    } = this.state;

    let recordsHash = d3.group(
      filteredEvents.filter((d) => d.tier && +d.tier < 3),
      (d) => d.eventType
    );
    let records =
      (eventType === "all" ? filteredEvents : recordsHash.get(eventType)) || [];

    const roleInCancerLabel = t("components.filtered-events-panel.role");
    const effectLabel = t("components.filtered-events-panel.effect");

    const columns = [
      {
        title: t("components.filtered-events-panel.gene"),
        dataIndex: "gene",
        key: "gene",
        width: 100,
        ellipsis: {
          showTitle: false,
        },
        filters: [...new Set(records.map((d) => d.gene))]
          .sort((a, b) => d3.ascending(a, b))
          .map((d) => {
            return {
              text: d,
              value: d,
            };
          }),
        filterMultiple: true,
        onFilter: (value, record) => record.gene?.startsWith(value),
        filteredValue: geneFilters, // controlled by the component
        filterSearch: true,
        sorter: {
          compare: (a, b) => {
            if (a.gene == null) return 1;
            if (b.gene == null) return -1;
            return d3.ascending(a.gene, b.gene);
          },
        },
        render: (_, record) => {
        const alterationId = record.uid;
        const count = getAllInterpretationsForAlteration(store.getState(), alterationId).length;

        return record.gene != null ? (
        <Button
          type="link"
        onClick={() => selectFilteredEvent(record, "detail")}
        >
        <Tooltip placement="topLeft" title={record.gene}>
            {record.gene} {count > 0 && <InterpretationsAvatar tooltipText={`Found ${count} interpretation(s)`} size={16} />}
            </Tooltip>
        </Button>
        ) : (
        <Text italic disabled>
            <BsDashLg />
        </Text>
      );
    },
      },
      {
        title: (
          <Text
            className="filtered-events-header-text"
            ellipsis={{ tooltip: roleInCancerLabel }}
          >
            {roleInCancerLabel}
          </Text>
        ),
        dataIndex: "role",
        key: "role",
        width: 160,
        onHeaderCell: () => ({
          className: "filtered-events-header-cell",
        }),
        filters: [...new Set(records.map((d) => d.role))]
          .sort((a, b) => d3.ascending(a, b))
          .map((d) => {
            return {
              text: d,
              value: d,
            };
          }),
        filterMultiple: true,
        onFilter: (value, record) => record.role === value,
        filteredValue: roleFilters, // controlled by the component
        sorter: {
          compare: (a, b) => {
            if (a.role == null) return 1;
            if (b.role == null) return -1;
            return d3.ascending(a.role, b.role);
          },
        },
        render: (_, record) =>
          record.role != null ? (
            record.role
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.variant"),
        dataIndex: "variant",
        key: "variant",
        width: 120,
        ellipsis: {
          showTitle: false,
        },
        onCell: () => ({
          className: "filtered-events-variant-cell",
        }),
        sorter: {
          compare: (a, b) => {
            if (a.variant == null) return 1;
            if (b.variant == null) return -1;
            return d3.ascending(a.variant, b.variant);
          },
        },
        filters: [...new Set(records.map((d) => d.variant))]
          .sort((a, b) => d3.ascending(a, b))
          .map((d) => {
            return {
              text: d,
              value: d,
            };
          }),
        filterMultiple: true,
        onFilter: (value, record) => record.variant === value,
        filteredValue: variantFilters, // controlled by the component
        render: (_, record) =>
          record.variant != null ? (
            <Text
              ellipsis={{ tooltip: record.variant }}
              className="filtered-events-ellipsis-text"
            >
              {record.variant}
            </Text>
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.type"),
        dataIndex: "type",
        key: "type",
        width: 240,
        sorter: {
          compare: (a, b) => {
            if (a.type == null) return 1;
            if (b.type == null) return -1;
            return d3.ascending(a.type, b.type);
          },
        },
        filters: [...new Set(records.map((d) => d.type))].map((d) => {
          return {
            text: d,
            value: d,
          };
        }),
        filterMultiple: true,
        onFilter: (value, record) => record.type === value,
        filteredValue: typeFilters, // controlled by the component
        render: (_, record) =>
          record.type != null ? (
            record.type
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: (
          <Text
            className="filtered-events-header-text"
            ellipsis={{ tooltip: effectLabel }}
          >
            {effectLabel}
          </Text>
        ),
        dataIndex: "effect",
        key: "effect",
        width: 160,
        onHeaderCell: () => ({
          className: "filtered-events-header-cell",
        }),
        filters: [...new Set(records.map((d) => d.effect))]
          .sort((a, b) => d3.ascending(a, b))
          .map((d) => {
            return {
              text: d,
              value: d,
            };
          }),
        filterMultiple: true,
        onFilter: (value, record) => record.effect === value,
        filteredValue: effectFilters, // controlled by the component
        sorter: {
          compare: (a, b) => {
            if (a.effect == null) return 1;
            if (b.effect == null) return -1;
            return d3.ascending(a.effect, b.effect);
          },
        },
        render: (_, record) =>
          record.effect != null ? (
            record.effect
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: (
          <Space>
            {t("components.filtered-events-panel.tier")}
            <Tooltip
              title={
                <Space direction="vertical">
                  {[1, 2, 3].map((d, i) => (
                    <Space key={i}>
                      <Avatar
                        size="small"
                        style={{
                          color: "#FFF",
                          backgroundColor: tierColor(+d),
                        }}
                      >
                        {d}
                      </Avatar>
                      {t(`components.filtered-events-panel.tier-info.${d}`)}
                    </Space>
                  ))}
                </Space>
              }
            >
              <InfoCircleOutlined />
            </Tooltip>
          </Space>
        ),
        dataIndex: "tier",
        key: "tier",
        width: 120,
        sorter: {
          compare: (a, b) => {
            if (a.tier == null) return 1;
            if (b.tier == null) return -1;
            return d3.ascending(+a.tier, +b.tier);
          },
        },
        filters: [...new Set(records.map((d) => d.tier))].map((d) => {
          return {
            text: d,
            value: +d,
          };
        }),
        filterMultiple: true,
        onFilter: (value, record) => +record.tier === +value,
        filteredValue: tierFilters, // controlled by the component
        render: (_, record) =>
          record.tier != null ? (
            <Tooltip
              title={this.getTierTooltipContent(record)}
            >
              <Button
                type="link"
                onClick={() => selectFilteredEvent(record, "detail")}
              >
                <Avatar
                  size="small"
                  style={{
                    color: "#FFF",
                    backgroundColor: tierColor(+record.tier),
                  }}
                >
                  {record.tier}
                </Avatar>
              </Button>
            </Tooltip>
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.estimatedAlteredCopies"),
        dataIndex: "estimatedAlteredCopies",
        key: "estimatedAlteredCopies",
        width: 100,
        sorter: {
          compare: (a, b) => {
            if (a.estimatedAlteredCopies == null) return 1;
            if (b.estimatedAlteredCopies == null) return -1;
            return d3.ascending(
              +a.estimatedAlteredCopies,
              +b.estimatedAlteredCopies
            );
          },
        },
        render: (_, record) =>
          record.estimatedAlteredCopies != null ? (
            d3.format(".3f")(+record.estimatedAlteredCopies)
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.segmentCopyNumber"),
        dataIndex: "segmentCopyNumber",
        key: "segmentCopyNumber",
        width: 130,
        sorter: {
          compare: (a, b) => {
            if (a.segmentCopyNumber == null) return 1;
            if (b.segmentCopyNumber == null) return -1;
            return d3.ascending(+a.segmentCopyNumber, +b.segmentCopyNumber);
          },
        },
        render: (_, record) =>
          record.segmentCopyNumber != null ? (
            d3.format(".3f")(+record.segmentCopyNumber)
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.fusionCopyNumber"),
        dataIndex: "fusionCopyNumber",
        key: "fusionCopyNumber",
        width: 100,
        sorter: {
          compare: (a, b) => {
            if (a.fusionCopyNumber == null) return 1;
            if (b.fusionCopyNumber == null) return -1;
            return d3.ascending(+a.fusionCopyNumber, +b.fusionCopyNumber);
          },
        },
        render: (_, record) =>
          record.fusionCopyNumber != null ? (
            d3.format(".3f")(+record.fusionCopyNumber)
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.altCounts"),
        dataIndex: "altCounts",
        key: "altCounts",
        width: 100,
        sorter: {
          compare: (a, b) => {
            if (a.altCounts == null) return 1;
            if (b.altCounts == null) return -1;
            return d3.ascending(+a.altCounts, +b.altCounts);
          },
        },
        render: (_, record) =>
          record.altCounts != null ? (
            +record.altCounts
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.refCounts"),
        dataIndex: "refCounts",
        key: "refCounts",
        width: 100,
        sorter: {
          compare: (a, b) => {
            if (a.refCounts == null) return 1;
            if (b.refCounts == null) return -1;
            return d3.ascending(+a.refCounts, +b.refCounts);
          },
        },
        render: (_, record) =>
          record.refCounts != null ? (
            +record.refCounts
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.vaf"),
        dataIndex: "vaf",
        key: "vaf",
        width: 120,
        sorter: {
          compare: (a, b) => {
            if (a.vaf == null) return 1;
            if (b.vaf == null) return -1;
            return d3.ascending(+a.vaf, +b.vaf);
          },
        },
        render: (_, record) =>
          record.vaf != null ? (
            d3.format(".3f")(+record.vaf)
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.location"),
        dataIndex: "location",
        key: "location",
        width: 260,
        fixed: "right",
        ellipsis: true,
        onCell: () => ({
          className: "filtered-events-location-cell-wrapper",
        }),
        render: (_, record) =>
          record.location != null ? (
            <div className="filtered-events-location-cell">
              <Text
                ellipsis={{ tooltip: record.location }}
                className="filtered-events-location-text filtered-events-ellipsis-text"
              >
                {record.location}
              </Text>
              <Button
                type="link"
                onClick={() => selectFilteredEvent(record, "tracks")}
              >
                <ArrowRightOutlined />
              </Button>
            </div>
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
    ];

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
                  options={Object.keys(eventColumns).map((d) => {
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
            <Row className="ant-panel-container ant-home-plot-container">
              <Col flex="none">
                <Space>
                  <Button
                    icon={<EyeOutlined />}
                    onClick={this.handlePreviewReport}
                    disabled={loading || this.state.previewLoading}
                    className="preview-btn"
                  >
                    Preview Report
                  </Button>
                  <Button
                    onClick={this.handleLoadReport}
                    className="import-btn"
                  >
                    {t("components.filtered-events-panel.load-report")}
                  </Button>
                  <Button
                    type="primary"
                    icon={<FileTextOutlined />}
                    onClick={this.handleExportNotes}
                    disabled={loading || this.state.exporting}
                    className="export-btn"
                  >
                    {t("components.filtered-events-panel.export.notes")}
                  </Button>
                  <input type="file" ref={this.fileInputRef} accept=".html" style={{display: 'none'}} onChange={this.handleFileChange} />
                </Space>
              </Col>
              <Col flex="auto" />
              <Col style={{ textAlign: "right" }} flex="none">
                <Button
                  danger
                  onClick={this.handleResetReportState}
                  className="reset-state-btn"
                >
                  {t("components.filtered-events-panel.reset-state")}
                </Button>
              </Col>
              <Col className="gutter-row table-container" span={24}>
                {
                  <Skeleton active loading={loading}>
                    <Table
                      columns={columns.filter((d, i) =>
                        eventColumns[eventType].includes(i)
                      )}
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
            <ReportPreviewModal
              visible={this.state.previewVisible}
              onCancel={this.handleClosePreview}
              loading={this.state.previewLoading}
              html={this.state.previewHtml}
            />
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
  resetTierOverrides: () => dispatch(resetTierOverrides()),
  clearCaseInterpretations: (caseId) => dispatch(interpretationsActions.clearCaseInterpretations(caseId)),
  updateInterpretation: (interpretation) => dispatch(interpretationsActions.updateInterpretation(interpretation)),
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
    mergedEvents,
    CaseReport: state.CaseReport,
    Interpretations: state.Interpretations,
    dataset: state?.Settings?.dataset,
  };
};
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(FilteredEventsListPanel)));
