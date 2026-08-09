import React, { Component } from "react";
import { Button, message, Modal, Skeleton, Space } from "antd";
import { CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import { copyReportDocument } from "../../helpers/copyReportDocument";
import {
  LoadingContainer,
  PreviewContainer,
  PreviewIframe,
  PreviewLayout,
  ReportToolbar,
} from "./index.style";

class ReportPreviewModal extends Component {
  state = {
    copying: false,
  };

  previewIframeRef = React.createRef();

  handleCopyReport = async () => {
    const { html, loading } = this.props;
    const reportDocument = this.previewIframeRef.current?.contentDocument;
    if (
      loading ||
      !html ||
      !reportDocument?.querySelector(".report-document")
    ) {
      message.error("Report unavailable.");
      return;
    }

    try {
      this.setState({ copying: true });
      await copyReportDocument(reportDocument);
      message.success("Report copied.");
    } catch (error) {
      console.error("Report copy failed:", error);
      message.error("Unable to copy report.");
    } finally {
      this.setState({ copying: false });
    }
  };

  render() {
    const {
      visible,
      loading,
      html,
      exportLabel,
      resetLabel,
      exporting,
    } = this.props;
    const copyDisabled = loading || !html || this.state.copying;

    return (
      <Modal
        title="Report Preview"
        open={visible}
        onCancel={this.props.onCancel}
        footer={null}
        width="90%"
        style={{ top: 20 }}
        bodyStyle={{ height: "calc(100vh - 100px)", padding: 0 }}
      >
        <PreviewLayout>
          <ReportToolbar>
            <Space>
              <Button
                icon={<CopyOutlined />}
                onClick={this.handleCopyReport}
                disabled={copyDisabled}
                loading={this.state.copying}
                aria-label="Copy Report"
              >
                Copy Report
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={this.props.onExport}
                disabled={loading}
                loading={exporting}
              >
                {exportLabel}
              </Button>
            </Space>
            <Button
              danger
              onClick={this.props.onReset}
              disabled={loading}
            >
              {resetLabel}
            </Button>
          </ReportToolbar>
          <PreviewContainer>
            {loading ? (
              <LoadingContainer>
                <Skeleton active />
              </LoadingContainer>
            ) : (
              <PreviewIframe
                ref={this.previewIframeRef}
                srcDoc={html}
                title="Report Preview"
              />
            )}
          </PreviewContainer>
        </PreviewLayout>
      </Modal>
    );
  }
}

export { ReportPreviewModal };
export default ReportPreviewModal;
