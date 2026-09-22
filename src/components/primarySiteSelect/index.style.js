import styled from "styled-components";

const Wrapper = styled.div`
  display: inline-grid;
  grid-template-columns: minmax(0, 1fr);
  max-width: 100%;
  min-width: 0;
  vertical-align: middle;

  /* The existing label sets the width, not a fixed-width form field. */
  .primary-site-label-width,
  .ant-select {
    grid-area: 1 / 1;
    font: inherit;
  }
  .primary-site-label-width {
    visibility: hidden;
    white-space: nowrap;
    padding-right: 18px;
    line-height: 24px;
  }
  .ant-select {
    width: 100%;
    min-width: 0;
    height: 24px;
  }
  .ant-select:not(.ant-select-customize-input) .ant-select-selector {
    height: 24px;
    padding: 0 18px 0 0;
    background: transparent;
    border: 0;
    border-radius: 2px;
  }
  .ant-select-single.ant-select-show-arrow .ant-select-selection-item,
  .ant-select-single.ant-select-show-arrow .ant-select-selection-placeholder {
    line-height: 24px;
    padding-right: 0;
  }
  .ant-select-selection-search {
    left: 0;
    right: 18px;
  }
  .ant-select-selection-search-input {
    height: 24px;
  }
  .ant-select-arrow {
    right: 0;
    font-size: 10px;
  }
  .ant-select:not(.ant-select-disabled):hover .ant-select-selection-item {
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }
  .ant-select:focus-within .ant-select-selector {
    outline: 1px solid #91caff;
    outline-offset: 2px;
  }
  .ant-alert {
    grid-row: 2;
  }
`;

export default Wrapper;
