import styled from "styled-components";

const Wrapper = styled.div`
  .ant-home-header-container {
    margin: 0px;
    background: white;
    border: 1px solid rgb(235, 237, 240);
    padding-bottom: 0px;
  }
  .ant-home-content-container {
    margin: 12px;
    margin-top: -45.5px;
  }
  .ant-panel-container {
    margin-top: 24px;
    margin-botton: 24px;
  }
  .ant-panel-list-container {
    margin: 24px;
  }
  /* Keep the tab bar reachable while scrolling: it sticks just below the
     pinned case header (its height is --gos-header-h). */
  .ant-home-content-container > .ant-tabs > .ant-tabs-nav {
    position: sticky;
    top: var(--gos-header-h, 0px);
    z-index: 11;
    background: white;
    padding: 0 8px;
    margin-left: -8px;
    margin-right: -8px;
    margin-bottom: 8px;
  }
  /* denser tab strip: more tabs per line before it wraps */
  .ant-home-content-container > .ant-tabs > .ant-tabs-nav .ant-tabs-tab + .ant-tabs-tab {
    margin-left: 20px;
  }
  .ant-home-content-container .ant-tabs-tab-btn:focus,
  .ant-home-content-container .ant-tabs-tab-btn:focus-visible {
    outline: none;
    box-shadow: none;
  }
  .stats .ant-statistic-content-value,
  .stats .ant-statistic-content-suffix {
    font-size: 16px;
  }
  .case-report-card .ant-card-body {
    min-height: 95px;
  }
`;

export default Wrapper;
