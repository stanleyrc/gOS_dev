import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Tag, Table, Button, Space, Row, Col } from "antd";
import { roleColorMap } from "../../helpers/utility";
import TracksModal from "../tracksModal";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const { updateSelectedFilteredEvent } = appActions;

class FilteredEventsListPanel extends Component {
  render() {
    const {
      t,
      report,
      filteredEvents,
      loading,
      genome,
      mutations,
      chromoBins,
      selectedFilteredEvent,
      coverageData,
      hetsnpsData,
      genesData,
      allelicData,
      updateSelectedFilteredEvent,
    } = this.props;
    if (!report || !filteredEvents) return null;

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
          <Button
            type="link"
            onClick={() => updateSelectedFilteredEvent(record)}
          >
            {record.location}
          </Button>
        ),
      },
    ];
    return (
      <Wrapper>
        <Row className="ant-panel-container ant-home-plot-container">
          <Col className="gutter-row" span={24}>
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
                  coveragePlotTitle: t("components.tracks-modal.coverage-plot"),
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
                  allelicPlotTitle: t("components.tracks-modal.allelic-plot"),
                  allelicPlotYAxisTitle: t(
                    "components.tracks-modal.allelic-plot-y-axis-title"
                  ),
                  handleOkClicked: () => updateSelectedFilteredEvent(null),
                  handleCancelClicked: () => updateSelectedFilteredEvent(null),
                  open,
                }}
              />
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
  updateSelectedFilteredEvent: (filteredEvent) =>
    dispatch(updateSelectedFilteredEvent(filteredEvent)),
});
const mapStateToProps = (state) => ({
  report: state.App.report,
  filteredEvents: state.App.filteredEvents,
  selectedFilteredEvent: state.App.selectedFilteredEvent,
  loading: state.App.loading,
  genome: state.App.genome,
  mutations: state.App.mutations,
  allelicData: state.App.allelic,
  chromoBins: state.App.chromoBins,
  coverageData: state.App.coverageData,
  hetsnpsData: state.App.hetsnpsData,
  genesData: state.App.genesData,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(FilteredEventsListPanel));
