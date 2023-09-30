import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Tag, Table } from "antd";
import { roleColorMap } from "../../helpers/utility";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const { updateSelectedFilteredEvent } = appActions;

class FilteredEventsListPanel extends Component {
  render() {
    const { t, report, filteredEvents } = this.props;
    if (!report) return null;

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
      },
    ];
    return (
      <Wrapper>
        <Table
          columns={columns}
          dataSource={filteredEvents}
          pagination={{ pageSize: 50 }}
        />
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
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(FilteredEventsListPanel));
