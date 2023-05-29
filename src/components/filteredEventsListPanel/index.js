import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Tag, Card, Space, Descriptions, Typography } from "antd";
import { roleColorMap } from "../../helpers/utility";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const { Text } = Typography;
const { Item } = Descriptions;
const { updateSelectedFilteredEvent } = appActions;

class FilteredEventsListPanel extends Component {
  handleTabChange = (key) => {
    const { selectedFiles, updateSelectedFilteredEvent } = this.props;
    const { filteredEvents } = selectedFiles[0];
    updateSelectedFilteredEvent(filteredEvents.find((e) => e.gene === key));
  };

  render() {
    const { t, selectedFiles, selectedFilteredEvent } = this.props;
    if (selectedFiles.length < 1) return null;

    const { filteredEvents } = selectedFiles[0];

    const tabList = filteredEvents.map((d) => {
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
                <Tag color={roleColorMap()[tag]} key={tag}>
                  {tag}
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
