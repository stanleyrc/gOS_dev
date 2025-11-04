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
  Input,
  Collapse,
} from "antd";
// centralized anchor/key helpers
import { eventAnchor, tierKey as keyTier } from "../../helpers/reportKeys";
import { FileTextOutlined } from "@ant-design/icons";
import { BsDashLg } from "react-icons/bs";
import * as d3 from "d3";
import { ArrowRightOutlined } from "@ant-design/icons";
import { EditOutlined } from "@ant-design/icons";
import { roleColorMap, tierColor } from "../../helpers/utility";
import TracksModal from "../tracksModal";
import Wrapper from "./index.style";
import { CgArrowsBreakeH } from "react-icons/cg";
import { InfoCircleOutlined } from "@ant-design/icons";
import { EditOutlined as _unusedEditOutlined } from "@ant-design/icons";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import ErrorPanel from "../errorPanel";
import ReportModal from "../reportModal";
import { linkPmids } from "../../helpers/format";
import {
  getTierOverride,
  clearCase,
  exportReport,
  saveTierOverride,
  saveGlobalNotes,
  buildTierKey,
  importReportStateFromHtml,
} from "../../helpers/reportStateStore";

const { Text } = Typography;

const {
  selectFilteredEvent,
  applyTierOverride,
  resetTierOverrides,
  updateAlterationFields,
  setGlobalNotes,
} = filteredEventsActions;

const eventColumns = {
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  snv: [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
  cna: [0, 1, 2, 3, 4, 5, 7, 12],
  fusion: [0, 1, 2, 3, 4, 5, 8, 12],
};

function EditableTextBlock({ title, value, onChange }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || "");
  const ref = React.useRef(null);

  React.useEffect(() => {
    setDraft(value || "");
  }, [value]);
  React.useEffect(() => {
    if (editing && ref.current) ref.current.focus({ cursor: "end" });
  }, [editing]);

  const handleBlur = () => {
    onChange(draft || "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="desc-block editable-field" style={{ marginBottom: 12 }}>
        <div className="desc-title">{title}:</div>
        <Input.TextArea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoSize={{ minRows: 3 }}
          onBlur={handleBlur}
          style={{ marginTop: 8 }}
        />
      </div>
    );
  }

  const html = value && linkPmids(value).replace(/\n/g, "<br/>");

  return (
    <div className="desc-block editable-field" style={{ marginBottom: 12 }}>
      <Collapse
        className="notes-collapse"
        bordered={false}
        ghost
        defaultActiveKey={[]}
      >
        <Collapse.Panel
          key="notes"
          header={
            <div className="notes-header">
              <span className="notes-header-title">{title}</span>
              <button
                type="button"
                className="edit-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                aria-label={`Edit ${title}`}
              >
                <EditOutlined />
              </button>
            </div>
          }
        >
          <div className="notes-view">
            {value ? (
              <div
                className="desc-text"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <span className="notes-empty">No notes added</span>
            )}
          </div>
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}

class FilteredEventsListPanel extends Component {
  isApplyingOverrides = false;
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
    showReportModal: false,
    exporting: false,
  };

  // add as a class field

  handleExportNotes = async () => {
    const { id, filteredEvents, report, originalFilteredEvents, globalNotes } =
      this.props;
    try {
      this.setState({ exporting: true });
      await exportReport({
        id,
        reportMeta: report,
        filteredEvents,
        originalFilteredEvents,
        globalNotes,
      });
    } catch (err) {
      console.error("Report export failed:", err);
    } finally {
      this.setState({ exporting: false });
    }
  };

  handleLoadReport = async () => {
    try {
      const { t } = this.props;
      const file = await new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".html,text/html";
        input.onchange = () => resolve(input.files && input.files[0]);
        input.click();
      });
      if (!file) return;

      const text = await file.text();
      const caseId = String(this.props.id || "");

      try {
        await importReportStateFromHtml({
          htmlText: text,
          caseId,
          filteredEvents: this.props.filteredEvents,
          applyTierOverride: this.props.applyTierOverride,
          updateAlterationFields: this.props.updateAlterationFields,
          setGlobalNotes: this.props.setGlobalNotes,
        });
        alert(t("components.filtered-events-panel.import.loaded"));
      } catch (err) {
        if (err && err.code === "MISMATCH_CASE") {
          alert(t("components.filtered-events-panel.import.mismatch-case"));
          return;
        }
        if (err && err.code === "MISSING_STATE") {
          alert(t("components.filtered-events-panel.import.missing-state"));
          return;
        }
        throw err;
      }
    } catch (err) {
      console.error("Failed to load report:", err);
      alert(this.props.t("components.filtered-events-panel.import.failed"));
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

    // 1) Clear IndexedDB for this case
    await clearCase(caseId);

    // 2) Reset Redux overrides and selection
    resetTierOverrides();
    selectFilteredEvent(null);

    // 3) Clear global notes in Redux (and persist empty to app IndexedDB via saga)
    this.props.setGlobalNotes("");
  };

  handleCloseReportModal = async () => {
    this.setState({ showReportModal: false });
    this.props.selectFilteredEvent(null);
  };

  componentDidMount() {
    this.applyAllTierOverridesIfAny({ reset: true });
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.originalFilteredEvents !== this.props.originalFilteredEvents &&
      Array.isArray(this.props.originalFilteredEvents) &&
      this.props.originalFilteredEvents.length
    ) {
      this.applyAllTierOverridesIfAny({ reset: true });
    }

    // Persist tier overrides to IndexedDB whenever tiers change in-app
    if (prevProps.filteredEvents !== this.props.filteredEvents) {
      const prevByUid = new Map(
        (prevProps.filteredEvents || []).map((d) => [d.uid, d])
      );
      const caseId = String(this.props.id || "");
      (this.props.filteredEvents || []).forEach((ev) => {
        const prev = prevByUid.get(ev.uid);
        if (!prev) return;
        const prevTier = prev.tier != null ? String(prev.tier) : "";
        const curTier = ev.tier != null ? String(ev.tier) : "";
        if (curTier !== prevTier) {
          const anchor = eventAnchor(ev?.gene, ev?.variant);
          if (!anchor) return;
          const tKey = keyTier(caseId, anchor);
          saveTierOverride(tKey, curTier);
        }
      });
    }

    // Persist global notes to gos_report IndexedDB when they change
    if (prevProps.globalNotes !== this.props.globalNotes) {
      const caseId = String(this.props.id || "");
      if (caseId) {
        saveGlobalNotes(caseId, this.props.globalNotes);
      }
    }
  }

  handleSegmentedChange = (eventType) => {
    this.setState({ eventType });
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

  applyAllTierOverridesIfAny = async (opts = {}) => {
    const { reset = false } = opts;
    const {
      id,
      filteredEvents,
      originalFilteredEvents,
      applyTierOverride,
      resetTierOverrides,
    } = this.props;

    if (
      !Array.isArray(filteredEvents) ||
      !filteredEvents.length ||
      !Array.isArray(originalFilteredEvents) ||
      !originalFilteredEvents.length
    ) {
      return;
    }

    if (this.isApplyingOverrides) return;
    this.isApplyingOverrides = true;

    try {
      if (reset) {
        // Start from the original snapshot to avoid stale overrides lingering
        resetTierOverrides();
      }

      // Build a quick lookup for original tiers
      const origTierMap = new Map(
        originalFilteredEvents.map((d) => [d.uid, String(d.tier)])
      );

      await Promise.all(
        filteredEvents.map(async (ev) => {
          const key = buildTierKey(id, ev);
          const override = await getTierOverride(key);

          if (override != null) {
            const origTier = origTierMap.get(ev.uid);
            if (String(origTier) !== String(override)) {
              applyTierOverride(ev.uid, String(override));
            }
          }
        })
      );
    } finally {
      this.isApplyingOverrides = false;
    }
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
      reportSrc,
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
      showReportModal,
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
        render: (_, record) =>
          record.gene != null ? (
            <Button
              type="link"
              onClick={() => selectFilteredEvent(record, "detail")}
            >
              <Tooltip placement="topLeft" title={record.gene}>
                {record.gene}
              </Tooltip>
            </Button>
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
              title={t(
                `components.filtered-events-panel.tier-info.${record.tier}`
              )}
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
            <Row className="ant-panel-container ant-home-plot-container">
              <Col span={24}>
                <EditableTextBlock
                  title={t("components.alteration-card.labels.notes")}
                  value={this.props.globalNotes || ""}
                  onChange={(v) => this.props.setGlobalNotes(v)}
                />
              </Col>
            </Row>
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
                  style={{ float: "right", marginBottom: 16 }}
                >
                  {t("components.filtered-events-panel.reset-filters")}
                </Button>
              </Col>
            </Row>
            <Row className="ant-panel-container ant-home-plot-container">
              <Col flex="none">
                <Space>
                  <Button
                    type="primary"
                    icon={<FileTextOutlined />}
                    onClick={this.handleExportNotes}
                    disabled={loading || this.state.exporting}
                    style={{ marginBottom: 16 }}
                  >
                    {t("components.filtered-events-panel.export.notes")}
                  </Button>
                  <Button
                    onClick={this.handleLoadReport}
                    style={{ marginBottom: 16 }}
                  >
                    {t("components.filtered-events-panel.load-report")}
                  </Button>
                </Space>
              </Col>
              <Col flex="auto" />
              <Col style={{ textAlign: "right" }} flex="none">
                <Button
                  danger
                  onClick={this.handleResetReportState}
                  style={{ marginBottom: 16 }}
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
                        src={
                          reportSrc
                            ? `${reportSrc}#${eventAnchor(
                                selectedFilteredEvent?.gene,
                                selectedFilteredEvent?.variant
                              )}`
                            : undefined
                        }
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
                    {showReportModal && reportSrc && (
                      <ReportModal
                        open={showReportModal}
                        onClose={this.handleCloseReportModal}
                        src={reportSrc}
                        title={t(
                          "components.filtered-events-panel.export.notes"
                        )}
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
  applyTierOverride: (uid, tier) => dispatch(applyTierOverride(uid, tier)),
  resetTierOverrides: () => dispatch(resetTierOverrides()),
  updateAlterationFields: (uid, changes) =>
    dispatch(updateAlterationFields(uid, changes)),
  setGlobalNotes: (notes) => dispatch(setGlobalNotes(notes)),
});
const mapStateToProps = (state) => ({
  loading: state.FilteredEvents.loading,
  filteredEvents: state.FilteredEvents.filteredEvents,
  originalFilteredEvents: state.FilteredEvents.originalFilteredEvents,
  selectedFilteredEvent: state.FilteredEvents.selectedFilteredEvent,
  viewMode: state.FilteredEvents.viewMode,
  error: state.FilteredEvents.error,
  reportSrc: state.FilteredEvents.reportSrc,
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
  globalNotes: state.FilteredEvents.globalNotes,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(FilteredEventsListPanel)));
