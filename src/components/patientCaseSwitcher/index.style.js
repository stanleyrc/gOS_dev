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
    background: #e6f4ff;
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
  .patient-case-switcher-menu .patient-case-switcher-option-context {
    display: block;
    font-size: 12px;
    line-height: 18px;
  }
`;

const Wrapper = styled.span`
  display: inline-flex;
  align-items: center;
  vertical-align: middle;

  .patient-case-switcher-trigger {
    font-weight: 400;
  }
`;

export default Wrapper;
