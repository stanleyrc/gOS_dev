import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Tag, Table, Button, Modal, Space, Row, Col } from "antd";
import { roleColorMap } from "../../helpers/utility";
import GenomePanel from "../genomePanel";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const { updateSelectedFilteredEvent } = appActions;

class FilteredEventsListPanel extends Component {
  state = {
    open: false,
  };

  handleGenePanelClick = (event) => {
    this.setState({ open: true }, () =>
      this.props.updateSelectedFilteredEvent(event)
    );
  };

  render() {
    const {
      t,
      report,
      filteredEvents,
      loading,
      genome,
      chromoBins,
      selectedFilteredEvent,
    } = this.props;
    if (!report && !filteredEvents) return null;

    const { open } = this.state;
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
          ...new Set(filteredEvents.map((d) => d.role.split(",")).flat()),
        ].map((d) => {
          return {
            text: d,
            value: d,
          };
        }),
        onFilter: (value, record) => record.role.indexOf(value) === 0,
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
          <Button type="link" onClick={() => this.handleGenePanelClick(record)}>
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
              <Modal
                title={
                  <Space>
                    {selectedFilteredEvent.gene}
                    {selectedFilteredEvent.name}
                    {selectedFilteredEvent.type}
                    {selectedFilteredEvent.role?.split(",").map((tag) => (
                      <Tag color={roleColorMap()[tag.trim()]} key={tag.trim()}>
                        {tag.trim()}
                      </Tag>
                    ))}
                    {selectedFilteredEvent.tier}
                    {selectedFilteredEvent.location}
                  </Space>
                }
                centered
                open={open}
                onOk={() => this.setState({ open: false })}
                onCancel={() => this.setState({ open: false })}
                width={1200}
              >
                <GenomePanel
                  {...{
                    loading,
                    genome,
                    title: t("components.filtered-events-panel.genome-plot"),
                    chromoBins,
                    visible: true,
                    index: 0,
                  }}
                />
              </Modal>
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
  chromoBins: state.App.chromoBins,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(FilteredEventsListPanel));
