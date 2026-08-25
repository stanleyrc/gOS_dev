import styled from "styled-components";

const Wrapper = styled.div`
  .ant-modal {
    top: 16px;
  }

  .ant-modal-content {
    padding: 0;
    display: flex;
    flex-direction: column;
    max-height: 100vh;
    padding: 20px 24px;
  }

  .ant-modal-body {
    padding: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .filtered-event-details-tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .filtered-event-details-tabs .ant-tabs-content-holder {
    flex: 1;
    overflow: auto;       /* allow scrolling */
    display: flex;
    flex-direction: column;
    min-height: 0;        /* allow children to shrink */
  }

  .filtered-event-details-tabs .ant-tabs-content {
    height: 100%;
  }

  .filtered-event-details-tabs .ant-tabs-tabpane {
    height: 100%;
    min-height: 0;        /* critical for flex children scrolling */
  }

  .filtered-event-details-tabs .ant-tabs-tabpane:not(.ant-tabs-tabpane-hidden) {
    display: flex;
    flex-direction: column;
  }

  .filtered-event-tab-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .filtered-event-details-modal-loading {
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

`;

export default Wrapper;
