import React, { Component } from "react";
import { Modal, Tabs, Alert, Space, Spin, Tag, Typography } from "antd";
import Wrapper from "./index.style";

import TracksModal from "../tracksModal";
import AlterationCard from "../alterationCard";
import { withTranslation } from "react-i18next";
import { roleColorMap } from "../../helpers/utility";
import {
  FILTERED_EVENT_DETAILS_TAB_ORDER,
  FILTERED_EVENT_DETAILS_TABS,
  getFilteredEventDetailsHeading,
  getInlineTracksProps,
  normalizeFilteredEventDetailsTab,
} from "./model";

const { Text } = Typography;

export class FilteredEventDetailsModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      activeTab: normalizeFilteredEventDetailsTab(props.initialTab),
      contentReady: false,
    };
  }

  componentDidUpdate(prevProps) {
    const selectionChanged =
      prevProps.record?.uid !== this.props.record?.uid ||
      prevProps.initialTab !== this.props.initialTab;
    const closed = prevProps.open && !this.props.open;

    if (!selectionChanged && !closed) return;

    const nextState = {};
    const nextTab = normalizeFilteredEventDetailsTab(this.props.initialTab);
    if (this.state.activeTab !== nextTab) {
      nextState.activeTab = nextTab;
    }
    if (closed && this.state.contentReady) {
      nextState.contentReady = false;
    }
    if (Object.keys(nextState).length > 0) {
      this.setState(nextState);
    }
  }

  handleModalOpenChange = (presented) => {
    if (presented !== this.state.contentReady) {
      this.setState({ contentReady: presented });
    }
    if (this.props.afterOpenChange) {
      this.props.afterOpenChange(presented);
    }
  };

  handleTabChange = (activeTab) => {
    this.setState({
      activeTab: normalizeFilteredEventDetailsTab(activeTab),
    });
  };

  getTracksProps = (contentView) =>
    getInlineTracksProps({ ...this.props, contentView });

  renderHeading = () => {
    const heading = getFilteredEventDetailsHeading(this.props.record);
    const roleColors = roleColorMap();

    return (
      <Space>
        {heading.gene}
        {heading.name}
        {heading.type}
        {heading.roles.map((role, index) => (
          <Tag color={roleColors[role]} key={`${role}-${index}`}>
            {role}
          </Tag>
        ))}
        {heading.tier}
        {heading.location}
      </Space>
    );
  };

  renderTabContent = (tab) => {
    const { record, t } = this.props;

    if (tab === FILTERED_EVENT_DETAILS_TABS.ALTERATION) {
      return record ? (
        <AlterationCard record={record} />
      ) : (
        <Alert
          type="info"
          message={t("components.filtered-event-details-modal.no-selection")}
          showIcon
        />
      );
    }

    return (
      <div className="filtered-event-tab-content">
        <TracksModal {...this.getTracksProps(tab)} />
      </div>
    );
  };

  getTabItems = () => {
    const { t } = this.props;
    const { activeTab } = this.state;
    return FILTERED_EVENT_DETAILS_TAB_ORDER.map((tab) => ({
      key: tab,
      label: t(`components.filtered-event-details-modal.tabs.${tab}`),
      children: activeTab === tab ? this.renderTabContent(tab) : null,
    }));
  };

  renderModalContent = () => {
    if (!this.state.contentReady) {
      return (
        <div className="filtered-event-details-modal-loading">
          <Space direction="vertical" align="center" size="middle">
            <Spin size="large" />
            <Text>
              {this.props.t("components.filtered-event-details-modal.loading")}
            </Text>
          </Space>
        </div>
      );
    }

    return (
      <Tabs
        className="filtered-event-details-tabs"
        activeKey={this.state.activeTab}
        onChange={this.handleTabChange}
        items={this.getTabItems()}
      />
    );
  };

  render() {
    const { open, onClose } = this.props;
    if (!open) return null;

    return (
      <Wrapper>
        <Modal
          open={open}
          onCancel={onClose}
          afterOpenChange={this.handleModalOpenChange}
          footer={null}
          title={this.renderHeading()}
          width="95vw"
          getContainer={false}
          forceRender
        >
          {this.renderModalContent()}
        </Modal>
      </Wrapper>
    );
  }
}

FilteredEventDetailsModal.defaultProps = {
  initialTab: FILTERED_EVENT_DETAILS_TABS.ALTERATION,
};

export default withTranslation("common")(FilteredEventDetailsModal);
