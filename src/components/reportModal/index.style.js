import styled from "styled-components";

const Wrapper = styled.div`
  .ant-modal {
    top: 16px;
  }

  .ant-modal-content {
    padding: 0;
    display: flex;
    flex-direction: column;
    max-height: 95vh;
    padding: 20px 24px;
    padding-bottom: 0;
  }

  .ant-modal-body {
    padding: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .report-tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .report-tabs .ant-tabs-content-holder {
    flex: 1;
    overflow: hidden;
  }

  .report-tabs .ant-tabs-content {
    height: 100%;
  }

  .report-tabs .ant-tabs-tabpane {
    height: 100%;
  }

  .report-tabs .ant-tabs-tabpane:not(.ant-tabs-tabpane-hidden) {
    display: flex;
  }

  .report-container {
    position: relative;
    width: 100%;
    background: #fff;
    flex: 1;
    height: 100%;
    min-height: 0;
  }

  .report-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
    background: rgba(255, 255, 255, 0.6);
  }

  .report-iframe {
    width: 100%;
    height: 80vh;
    display: block;
    border: 0;
  }
`;

export default Wrapper;
