import React, { Component } from "react";
import { Button, Modal, Skeleton, Space } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import {
  LoadingContainer,
  PreviewContainer,
  PreviewIframe,
  PreviewLayout,
  ReportToolbar,
} from "./index.style";

class ReportPreviewModal extends Component {
  render() {
    const {
      visible,
      onCancel,
      loading,
      html,
      onImport,
      onExport,
      onReset,
      importLabel,
      exportLabel,
      resetLabel,
      exporting,
    } = this.props;

    return (
      <Modal
        title="Report Preview"
        open={visible}
        onCancel={onCancel}
        footer={null}
        width="90%"
        style={{ top: 20 }}
        bodyStyle={{ height: "calc(100vh - 100px)", padding: 0 }}
      >
        <PreviewLayout>
          <ReportToolbar>
            <Space>
              <Button
                icon={<UploadOutlined />}
                onClick={onImport}
                disabled={loading}
              >
                {importLabel}
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={onExport}
                disabled={loading}
                loading={exporting}
              >
                {exportLabel}
              </Button>
            </Space>
            <Button danger onClick={onReset} disabled={loading}>
              {resetLabel}
            </Button>
          </ReportToolbar>
          <PreviewContainer>
            {loading ? (
              <LoadingContainer>
                <Skeleton active />
              </LoadingContainer>
            ) : (
              <PreviewIframe srcDoc={html} title="Report Preview" />
            )}
          </PreviewContainer>
        </PreviewLayout>
      </Modal>
    );
  }
}

export default ReportPreviewModal;
