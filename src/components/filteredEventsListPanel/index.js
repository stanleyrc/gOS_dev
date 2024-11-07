import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
import { connect } from "react-redux";
import { Tag, Table, Button, Space, Row, Col, Skeleton, Tooltip } from "antd";
import { roleColorMap } from "../../helpers/utility";
import TracksModal from "../tracksModal";
import Wrapper from "./index.style";
import { CgArrowsBreakeH } from "react-icons/cg";
import { InfoCircleOutlined } from "@ant-design/icons";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import ErrorPanel from "../errorPanel";
import FilteredEventModal from "../filteredEventModal";

const { selectFilteredEvent } = filteredEventsActions;

class FilteredEventsListPanel extends Component {
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
      hetsnps,
      genes,
      allelic,
      selectFilteredEvent,
    } = this.props;

    //const { open } = this.state;
    let open = selectedFilteredEvent?.id;

    const columns = [
      {
        title: t("components.filtered-events-panel.gene"),
        dataIndex: "gene",
        key: "gene",
        filters: [...new Set(filteredEvents.map((d) => d.gene))].map((d) => {
          return {
            text: d,
            value: d,
          };
        }),
        filterMultiple: false,
        onFilter: (value, record) => record.gene.indexOf(value) === 0,
        render: (_, record) =>
          record.gene ? (
            <Button
              type="link"
              onClick={() => selectFilteredEvent(record, "detail")}
            >
              {record.gene}
            </Button>
          ) : (
            t("components.filtered-events-panel.unavailable", {
              value: "gene",
            })
          ),
      },
      {
        title: t("components.filtered-events-panel.dosage"),
        dataIndex: "dosage",
        key: "dosage",
        render: (value) =>
          value
            ? value
            : t("components.filtered-events-panel.unavailable", {
                value: "dosage",
              }),
      },
      {
        title: t("components.filtered-events-panel.variant"),
        dataIndex: "variant",
        key: "variant",
        filters: [...new Set(filteredEvents.map((d) => d.variant))].map((d) => {
          return {
            text: d,
            value: d,
          };
        }),
        filterMultiple: false,
        onFilter: (value, record) => record.variant.indexOf(value) === 0,
      },
      {
        title: t("components.filtered-events-panel.type"),
        dataIndex: "type",
        key: "type",
        filters: [...new Set(filteredEvents.map((d) => d.type))].map((d) => {
          return {
            text: d,
            value: d,
          };
        }),
        filterMultiple: false,
        onFilter: (value, record) => record.type.indexOf(value) === 0,
      },
      {
        title: (
          <Space>
            {t("components.filtered-events-panel.tier")}
            <Tooltip
              title={
                <Space direction="vertical">
                  {[1, 2, 3].map((d) => (
                    <Space>
                      {d}:{t(`components.filtered-events-panel.tier-info.${d}`)}
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
        sorter: (a, b) => a.tier - b.tier,
        filters: [...new Set(filteredEvents.map((d) => d.tier))].map((d) => {
          return {
            text: d,
            value: d,
          };
        }),
        filterMultiple: false,
        onFilter: (value, record) => record.tier === value,
        render: (_, record) =>
          record.tier ? (
            <Tooltip
              title={t(
                `components.filtered-events-panel.tier-info.${record.tier}`
              )}
            >
              <Button
                type="link"
                onClick={() => selectFilteredEvent(record, "detail")}
              >
                {record.tier}
              </Button>
            </Tooltip>
          ) : (
            t("components.filtered-events-panel.unavailable", { value: "tier" })
          ),
      },
      {
        title: t("components.filtered-events-panel.location"),
        dataIndex: "location",
        key: "location",
        render: (_, record) =>
          record.location ? (
            <Button
              type="link"
              onClick={() => selectFilteredEvent(record, "tracks")}
            >
              {record.location}
            </Button>
          ) : (
            t("components.filtered-events-panel.unavailable", {
              value: "location",
            })
          ),
      },
    ];
    return (
      <Wrapper>
        <Row className="ant-panel-container ant-home-plot-container">
          <Col className="gutter-row" span={24}>
            {error ? (
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
            ) : (
              <Skeleton active loading={loading}>
                <Table
                  columns={columns}
                  dataSource={filteredEvents}
                  pagination={{ pageSize: 50 }}
                />
                {selectedFilteredEvent && viewMode === "tracks" && (
                  <TracksModal
                    {...{
                      loading,
                      genome,
                      mutations,
                      genomeCoverage,
                      hetsnps,
                      genes,
                      chromoBins,
                      allelic,
                      modalTitleText: selectedFilteredEvent.gene,
                      modalTitle: (
                        <Space>
                          {selectedFilteredEvent.gene}
                          {selectedFilteredEvent.name}
                          {selectedFilteredEvent.type}
                          {selectedFilteredEvent.role?.split(",").map((tag) => (
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
                      genomePlotTitle: t("components.tracks-modal.genome-plot"),
                      genomePlotYAxisTitle: t(
                        "components.tracks-modal.genome-y-axis-title"
                      ),
                      coveragePlotTitle: t(
                        "components.tracks-modal.coverage-plot"
                      ),
                      coverageYAxisTitle: t(
                        "components.tracks-modal.coverage-y-axis-title"
                      ),
                      coverageYAxis2Title: t(
                        "components.tracks-modal.coverage-y-axis2-title"
                      ),
                      hetsnpPlotTitle: t("components.tracks-modal.hetsnp-plot"),
                      hetsnpPlotYAxisTitle: t(
                        "components.tracks-modal.hetsnp-plot-y-axis-title"
                      ),
                      hetsnpPlotYAxis2Title: t(
                        "components.tracks-modal.hetsnp-plot-y-axis2-title"
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
                  <FilteredEventModal
                    {...{
                      record: selectedFilteredEvent,
                      handleOkClicked: () => selectFilteredEvent(null),
                      handleCancelClicked: () => selectFilteredEvent(null),
                      open,
                    }}
                  />
                )}
              </Skeleton>
            )}
          </Col>
        </Row>
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
  hetsnps: state.Hetsnps,
  genes: state.Genes,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(FilteredEventsListPanel)));
