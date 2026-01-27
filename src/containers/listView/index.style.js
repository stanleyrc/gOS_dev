import styled from "styled-components";

const Wrapper = styled.div`
  .ant-home-header-container {
    margin: 0px;
    background: white;
    border: 1px solid rgb(235, 237, 240);
    padding-bottom: 0px;
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
  .filters-collapse {
    margin-left: -12px;
  }
  .tags-container {
    width: 100%;
    align-items: stretch;
    margin-bottom: 10px;
  }
  .tags-container .ant-form-item {
    margin-bottom: 0;
  }
  .tags-container > .tags-operator-item.ant-form-item {
    flex: 0 0 22px;
  }
  .tags-container > .tags-cascader-item.ant-form-item {
    flex: 1 1 auto;
    min-width: 0;
  }
  .tags-operators-select {
    width: 100%;
    height: auto;
  }
  .tags-cascader {
    width: 100%;
  }
  .case-report-ellipsis-text {
    max-width: 150px;
    font-size: 16px;
  }

  /* Aggregations Panel Styles */
  .aggregation-panel-card {
    margin-top: 16px;
  }
  .aggregation-panel-header {
    margin-bottom: 16px;
  }
  .aggregation-field-selector {
    margin-bottom: 16px;
    display: flex;
    align-items: center;
  }
  .aggregation-loading {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
  }
  .aggregation-table-container {
    margin-top: 16px;
  }
  .aggregation-table-header {
    margin-bottom: 12px;
  }
  .aggregation-total-row {
    background-color: #fafafa;
  }

  /* Aggregations Visualization Styles */
  .aggregation-visualization-container {
    padding: 16px 0;
    min-height: 450px;
  }
  .aggregation-visualization-container .plot-container {
    overflow: visible;
  }
  .aggregation-visualization-container .ant-select {
    font-size: 12px;
  }
  .filter-slider-space {
    width: 100%;
  }
  .filter-slider-inputs {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
  }
  .filter-slider-input {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .filter-slider-input-label {
    font-size: 12px;
    color: #666;
    margin-bottom: 4px;
    text-align: left;
  }
  .filter-slider-input .align-right {
    text-align: right;
  }
  .filter-slider-input:first-child {
    align-items: flex-start;
  }
  .filter-slider-input:last-child {
    align-items: flex-end;
    text-align: right;
  }
`;

export default Wrapper;
