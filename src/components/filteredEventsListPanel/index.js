import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Tag, Card, Space, Descriptions, Typography, Select } from "antd";
import * as d3 from "d3";
import { roleColorMap } from "../../helpers/utility";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const { Text } = Typography;
const { Item } = Descriptions;
const { updateSelectedFilteredEvent } = appActions;

const ORDER = ["ascending", "descending"];

class FilteredEventsListPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      order: ORDER[0],
      types: [],
    };
  }

  handleTabChange = (key) => {
    const { selectedFiles, updateSelectedFilteredEvent } = this.props;
    const { filteredEvents } = selectedFiles[0];
    updateSelectedFilteredEvent(filteredEvents.find((e) => e.gene === key));
  };

  handleSortTypeChange = (key) => {
    this.setState({ order: key });
  };

  handleFilterGeneTypeChange = (key) => {
    this.setState({ types: key });
  };

  render() {
    const { t, selectedFiles, selectedFilteredEvent } = this.props;
    const { order, types } = this.state;
    if (selectedFiles.length < 1) return null;

    const { filteredEvents } = selectedFiles[0];

    const tabList = filteredEvents
      .filter((d) => types.length < 1 || types.includes(d.type))
      .sort((a, b) => d3[order](a.gene, b.gene))
      .map((d) => {
        return { key: d.gene, tab: d.gene };
      });
    let currentKey = selectedFilteredEvent.gene || filteredEvents[0]?.key;
    let currentEvent = filteredEvents.find((e) => e.gene === currentKey);
    let { gene, tier, type, name, role, chromosome, startPoint, endPoint } =
      currentEvent;
    return (
      <Wrapper>
        <Card
          style={{
            width: "100%",
          }}
          title={
            <Select
              placeholder={t(
                "components.filtered-events-panel.select-type.placeholder"
              )}
              mode="multiple"
              allowClear={true}
              bordered={false}
              showArrow
              style={{
                width: "30%",
              }}
              onChange={(key) => {
                this.handleFilterGeneTypeChange(key);
              }}
              options={[
                ...new Set(
                  filteredEvents
                    .map((d) => d.type)
                    .flat()
                    .map((d) => d.trim())
                    .sort((a, b) => d3.ascending(a, b))
                ),
              ].map((tag) => {
                return { value: tag };
              })}
            />
          }
          extra={
            <Select
              defaultValue={ORDER[0]}
              style={{ width: 220 }}
              bordered={false}
              onChange={(key) => {
                this.handleSortTypeChange(key);
              }}
              options={ORDER.map((d) => {
                return {
                  value: d,
                  label: t(`components.filtered-events-panel.sorting.${d}`),
                };
              })}
            />
          }
          tabList={tabList}
          activeTabKey={currentKey}
          tabBarExtraContent={<></>}
          onTabChange={(key) => {
            this.handleTabChange(key);
          }}
        >
          <Descriptions
            column={4}
            title={
              <Space>
                {gene}
                <Text type="secondary">{name}</Text>
              </Space>
            }
          >
            <Item label={t("components.filtered-events-panel.type")}>
              {type}
            </Item>
            <Item label={t("components.filtered-events-panel.role")}>
              {role?.split(",").map((tag) => (
                <Tag color={roleColorMap()[tag.trim()]} key={tag.trim()}>
                  {tag.trim()}
                </Tag>
              ))}
            </Item>
            <Item label={t("components.filtered-events-panel.tier")}>
              {tier}
            </Item>
            <Item label={t("components.filtered-events-panel.location")}>
              {chromosome}:{startPoint}-{endPoint}
            </Item>
          </Descriptions>
        </Card>
      </Wrapper>
    );
  }
}
FilteredEventsListPanel.propTypes = {
  selectedCase: PropTypes.object,
};
FilteredEventsListPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateSelectedFilteredEvent: (filteredEvent) =>
    dispatch(updateSelectedFilteredEvent(filteredEvent)),
});
const mapStateToProps = (state) => ({
  selectedFiles: state.App.selectedFiles,
  selectedFilteredEvent: state.App.selectedFilteredEvent,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(FilteredEventsListPanel));
