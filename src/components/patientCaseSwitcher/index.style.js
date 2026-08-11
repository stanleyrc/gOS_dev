import styled, { createGlobalStyle } from "styled-components";

export const PatientCaseMenuStyle = createGlobalStyle`
  .patient-case-switcher-menu .ant-dropdown-menu {
    max-height: 420px;
    overflow-y: auto;
  }
  .patient-case-switcher-menu .ant-dropdown-menu-item {
    min-width: 300px;
    padding: 8px 12px;
  }
  .patient-case-switcher-menu .ant-dropdown-menu-item.patient-case-switcher-current {
    background: transparent;
  }
  .patient-case-switcher-menu .patient-case-switcher-option-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .patient-case-switcher-menu .patient-case-switcher-option-pair {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .patient-case-switcher-menu .patient-case-switcher-current-check {
    flex: 0 0 auto;
    color: #52c41a;
  }
  .patient-case-switcher-menu .patient-case-switcher-option-context-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
  }
  .patient-case-switcher-menu .patient-case-switcher-option-context {
    font-size: 12px;
    line-height: 18px;
  }
  .patient-case-switcher-menu .patient-case-switcher-option-dataset {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .patient-case-switcher-menu .patient-case-switcher-option-date {
    flex: 0 0 auto;
    margin-left: auto;
    text-align: right;
  }
`;

const Wrapper = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  vertical-align: middle;

  .patient-case-switcher-trigger {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 0;
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: inherit;
    cursor: pointer;
    font: inherit;
    line-height: inherit;
    text-align: left;
  }

  .patient-case-switcher-trigger:hover,
  .patient-case-switcher-trigger:focus-visible {
    color: #1677ff;
    outline: none;
  }

  .patient-case-switcher-trigger:disabled {
    color: inherit;
    cursor: default;
    opacity: 0.65;
  }

  .patient-case-switcher-pair {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .patient-case-switcher-chevron {
    flex: 0 0 auto;
    color: rgba(0, 0, 0, 0.45);
    font-size: 12px;
  }

  .patient-case-switcher-static-title {
    display: inline-block;
    color: inherit;
    font: inherit;
    line-height: inherit;
  }

`;

export default Wrapper;
