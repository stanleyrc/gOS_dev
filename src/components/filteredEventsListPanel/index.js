import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
import { connect } from "react-redux";
import { Tag, Table, Button, Space, Row, Col, Skeleton } from "antd";
import { roleColorMap } from "../../helpers/utility";
import TracksModal from "../tracksModal";
import Wrapper from "./index.style";
import { CgArrowsBreakeH } from "react-icons/cg";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import ErrorPanel from "../errorPanel";

const { selectFilteredEvent } = filteredEventsActions;

class FilteredEventsListPanel extends Component {
  render() {
    const {
      t,
      id,
      filteredEvents,
      selectedFilteredEvent,
      loading,
      error,

      genome,
      mutations,
      chromoBins,
      coverageData,
      hetsnpsData,
      genesData,
      allelicData,
      selectFilteredEvent,
    } = this.props;

    //const { open } = this.state;
    let open = selectedFilteredEvent?.id;
    const columns = [
      {
        title: t("components.filtered-events-panel.gene"),
        dataIndex: "gene",
        key: "gene",
      },
      {
        title: t("components.filtered-events-panel.name"),
        dataIndex: "name",
        key: "name",
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
        title: t("components.filtered-events-panel.role"),
        dataIndex: "role",
        key: "role",
        render: (role) => (
          <>
            {role?.split(",").map((tag) => (
              <Tag color={roleColorMap()[tag.trim()]} key={tag.trim()}>
                {tag.trim()}
              </Tag>
            ))}
          </>
        ),
        filters: [
          ...new Set(
            filteredEvents
              .map((d) => d.role.split(","))
              .flat()
              .map((d) => d.trim())
          ),
        ].map((d) => {
          return {
            text: d,
            value: d,
          };
        }),
        onFilter: (value, record) => record.role.includes(value),
      },
      {
        title: t("components.filtered-events-panel.tier"),
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
      },
      {
        title: t("components.filtered-events-panel.location"),
        dataIndex: "location",
        key: "location",
        render: (_, record) => (
          <Button type="link" onClick={() => selectFilteredEvent(record)}>
            {record.location}
          </Button>
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
                {selectedFilteredEvent && (
                  <TracksModal
                    {...{
                      loading,
                      genomeData: genome,
                      mutationsData: mutations,
                      coverageData,
                      hetsnpsData,
                      genesData,
                      chromoBins,
                      allelicData,
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
  selectFilteredEvent: (filteredEvent) =>
    dispatch(selectFilteredEvent(filteredEvent)),
});
const mapStateToProps = (state) => ({
  loading: state.FilteredEvents.loading,
  filteredEvents: state.FilteredEvents.filteredEvents,
  selectedFilteredEvent: state.FilteredEvents.selectedFilteredEvent,
  error: state.FilteredEvents.error,
  id: state.CaseReport.id,
  report: state.CaseReport.metadata,

  genome: state.Genome.data,
  mutations: state.Mutations.data,
  allelicData: state.Allelic.data,
  chromoBins: state.Settings.chromoBins,
  coverageData: state.GenomeCoverage.data,
  hetsnpsData: state.Hetsnps.data,
  genesData: state.Genes.data,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(FilteredEventsListPanel)));
