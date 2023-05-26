import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Tag, Table, Card, Space, Descriptions, Typography } from "antd";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const { Text } = Typography;
const {} = appActions;

const roleColorMap = { oncogene: "geekblue", fusion: "green", TSG: "volcano" };

class FilteredEventsListPanel extends Component {
  state = { activeTabKey2: "" };

  onTab2Change = (key) => {
    this.setState({ activeTabKey2: key });
  };

  render() {
    const { t, selectedFiles } = this.props;
    if (selectedFiles.length < 1) return null;

    const { filteredEvents } = selectedFiles[0];

    const tabListNoTitle = filteredEvents.map((d) => {
      return { key: d.gene, tab: d.gene };
    });
    let currentKey = this.state.activeTabKey2 || tabListNoTitle[0]?.key;
    let currentEvent = filteredEvents.find((e) => e.gene === currentKey);
    let { gene, Tier, type, Name, id } = currentEvent;
    return (
      <Wrapper>
        <Card
          style={{
            width: "100%",
          }}
          tabList={tabListNoTitle}
          activeTabKey={currentKey}
          tabBarExtraContent={<></>}
          onTabChange={(key) => {
            this.onTab2Change(key);
          }}
        >
          <Descriptions
            column={4}
            title={
              <Space>
                {gene}
                <Text type="secondary">{Name}</Text>
              </Space>
            }
          >
            <Descriptions.Item label="Type">{type}</Descriptions.Item>
            <Descriptions.Item label="RoleInCancer">
              {currentEvent["Role.in.Cancer"].split(",").map((tag) => (
                <Tag color={roleColorMap[tag]} key={tag}>
                  {tag}
                </Tag>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="Tier">{Tier}</Descriptions.Item>
            <Descriptions.Item label="Location">
              {currentEvent["Genome.Location"]}
            </Descriptions.Item>
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
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  selectedFiles: state.App.selectedFiles,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(FilteredEventsListPanel));
