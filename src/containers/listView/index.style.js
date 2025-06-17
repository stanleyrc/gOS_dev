import styled from "styled-components";

const Wrapper = styled.div`
  .ant-home-header-container {
    margin: 0px;
    background: white;
    border: 1px solid rgb(235, 237, 240);
    padding-bottom: 50px;
  }
  .chat-float-button {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 100;
    width: 60px;
    height: 60px;
    font-size: 24px;
    transition: all 0.3s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

    &:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
  }
  .ant-home-content-container {
    margin: 24px;
    margin-top: -45.5px;
  }
  .ant-panel-container {
    margin-top: 24px;
    margin-botton: 24px;
  }
  .ant-panel-list-container {
    margin: 24px;
  }

  .filters-box .ant-form-item {
    margin-bottom: 10px;
  }
  .filters-box .ant-form-item-label {
    padding: 0px !important;
  }
  .results-top-box,
  .results-bottom-box {
    margin: 24px 0px;
  }
  .results-top-box .order-selector-container {
    text-align: right;
  }

  .order-select {
    width: 340px;
  }

  .stats .ant-statistic-content-value,
  .stats .ant-statistic-content-suffix {
    font-size: 16px;
  }
  .case-report-card .ant-card-body {
    min-height: 120px;
  }
`;

export default Wrapper;
