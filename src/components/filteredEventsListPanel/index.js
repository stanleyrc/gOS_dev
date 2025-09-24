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
  // message,
} from "antd";
import { FileTextOutlined } from "@ant-design/icons";
 // import { generateEventNotesPDF } from "../../helpers/notes"; // no longer used
import * as d3 from "d3";
import { ArrowRightOutlined } from "@ant-design/icons";
import { roleColorMap, tierColor } from "../../helpers/utility";
import TracksModal from "../tracksModal";
import Wrapper from "./index.style";
import { CgArrowsBreakeH } from "react-icons/cg";
import { InfoCircleOutlined } from "@ant-design/icons";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import ErrorPanel from "../errorPanel";
import ReportModal from "../reportModal";

/* helper to build the report anchor */
function slugify(s) {
  const str = String(s || "").trim().toLowerCase();
  const ascii = str.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "section";
}

const { Text } = Typography;

const { selectFilteredEvent } = filteredEventsActions;

const eventColumns = {
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  snv: [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
  cna: [0, 1, 2, 3, 4, 5, 7, 12],
  fusion: [0, 1, 2, 3, 4, 5, 8, 12],
};

class FilteredEventsListPanel extends Component {
  state = {
    eventType: "all",
    tierFilters: [1, 2], // start with tiers 1 & 2 checked
    typeFilters: [],
    roleFilters: [],
    effectFilters: [],
    variantFilters: [],
    geneFilters: [],
    showReportModal: false,
  };

  handleExportNotes = () => {
    this.setState({ showReportModal: true });
  };

  handleCloseReportModal = () => {
    this.setState({ showReportModal: false });
  };

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
      showReportModal,
    } = this.state;

    let recordsHash = d3.group(
      filteredEvents.filter((d) => d.tier && +d.tier < 3),
      (d) => d.eventType
    );
    let records =
      (eventType === "all" ? filteredEvents : recordsHash.get(eventType)) || [];

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
              {t("general.unavailable")}
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.role"),
        dataIndex: "role",
        key: "role",
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
              {t("general.unavailable")}
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.variant"),
        dataIndex: "variant",
        key: "variant",
        width: 120,
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
            record.variant
          ) : (
            <Text italic disabled>
              {t("general.unavailable")}
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.type"),
        dataIndex: "type",
        key: "type",
        width: 100,
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
              {t("general.unavailable")}
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.effect"),
        dataIndex: "effect",
        key: "effect",
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
              {t("general.unavailable")}
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
              {t("general.unavailable")}
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
              {t("general.unavailable")}
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
              {t("general.unavailable")}
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
              {t("general.unavailable")}
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
              {t("general.unavailable")}
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
              {t("general.unavailable")}
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
              {t("general.unavailable")}
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.location"),
        dataIndex: "location",
        key: "location",
        width: 100,
        fixed: "right",
        ellipsis: true,
        render: (_, record) =>
          record.location != null ? (
            <Space direction="horizontal" size={0}>
              {record.location}{" "}
              <Button
                type="link"
                onClick={() => selectFilteredEvent(record, "tracks")}
              >
                <ArrowRightOutlined />
              </Button>
            </Space>
          ) : (
            <Text italic disabled>
              {t("general.unavailable")}
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
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                onClick={this.handleExportNotes}
                style={{ marginBottom: 16 }}
              >
                {t("components.filtered-events-panel.export.notes")}
              </Button>
              <Col className="gutter-row table-container" span={24}>
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
            </Row>
            <Row className="ant-panel-container ant-home-plot-container">
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
                      scroll={{ x: "max-content", y: 500 }}
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
                            "components.tracks-modal.hetsnp-count"
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
                        onClose={() => selectFilteredEvent(null)}
                        src={`${process.env.PUBLIC_URL}/data/${id}/report.html#${slugify(`${selectedFilteredEvent?.gene} ${selectedFilteredEvent?.variant}`)}`}
                        title={selectedFilteredEvent?.gene || t("components.filtered-events-panel.export.notes")}
                      />
                    )}
                    <ReportModal
                      open={showReportModal}
                      onClose={this.handleCloseReportModal}
                      src={`${process.env.PUBLIC_URL}/data/${id}/report.html`}
                      title={t("components.filtered-events-panel.export.notes")}
                    />
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
const mapStateToProps = (state) => ({
  loading: state.FilteredEvents.loading,
  filteredEvents: state.FilteredEvents.filteredEvents,
  selectedFilteredEvent: state.FilteredEvents.selectedFilteredEvent,
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
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(FilteredEventsListPanel)));
