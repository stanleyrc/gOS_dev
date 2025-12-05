import React, { Component } from 'react';
import { Modal, Skeleton } from 'antd';
import { LoadingContainer, PreviewIframe } from './index.style';

class ReportPreviewModal extends Component {
  render() {
    const { visible, onCancel, loading, html } = this.props;

    return (
      <Modal
        title="Report Preview"
        open={visible}
        onCancel={onCancel}
        footer={null}
        width="90%"
        style={{ top: 20 }}
        bodyStyle={{ height: 'calc(100vh - 100px)', padding: 0 }}
      >
        {loading ? (
          <LoadingContainer>
            <Skeleton active />
          </LoadingContainer>
        ) : (
          <PreviewIframe
            srcDoc={html}
            title="Report Preview"
          />
        )}
      </Modal>
    );
  }
}

export default ReportPreviewModal;
