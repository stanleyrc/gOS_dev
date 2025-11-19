import React, { Component } from "react";
import { Modal, Space } from "antd";
import { withTranslation } from "react-i18next";
import cbioportalIcon from "../../assets/images/cbioportal_icon.png";

class CbioportalModal extends Component {
  render() {
    const { t, visible, onCancel } = this.props;

    return (
      <Modal
        title={
          <Space>
            <img
              src={cbioportalIcon}
              alt="cBioPortal"
              style={{
                height: "24px",
                width: "24px",
                filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))",
              }}
            />
            <span>{t("components.cbioportal-modal.title") || "cBioPortal Integration"}</span>
          </Space>
        }
        visible={visible}
        onCancel={onCancel}
        footer={null}
      >
        {/* cBioPortal form will go here */}
      </Modal>
    );
  }
}

export default withTranslation("common")(CbioportalModal);
