import styled, { createGlobalStyle } from "styled-components";

export const SavedQuerySelectorDropdownStyle = createGlobalStyle`
  .cohort-comparison-dropdown .ant-select-item {
    border-radius: 10px;
    margin: 2px 6px;
  }

  .cohort-comparison-dropdown .ant-select-item-option-content {
    min-width: 0;
  }

  .cohort-comparison-dropdown .favorite-query-option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    min-width: 0;
  }

  .cohort-comparison-dropdown .favorite-query-option-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }

  .cohort-comparison-dropdown .favorite-query-option-title {
    display: block;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cohort-comparison-dropdown .favorite-query-option-count {
    flex: 0 0 auto;
    white-space: nowrap;
    font-size: 12px;
    color: rgba(39, 73, 107, 0.82);
  }

  .cohort-comparison-dropdown .favorite-query-option-count strong {
    color: inherit;
    font-weight: 700;
  }

  .cohort-comparison-dropdown .favorite-query-option-description-wrap {
    display: block;
    min-width: 0;
  }

  .cohort-comparison-dropdown .favorite-query-option-description {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .cohort-comparison-dropdown .favorite-query-option-description strong {
    color: inherit;
    font-weight: 600;
  }

  .cohort-comparison-dropdown .ant-select-item-option-active:not(.ant-select-item-option-disabled) {
    background: transparent;
  }

  .cohort-comparison-dropdown .ant-select-item-option:hover:not(.ant-select-item-option-disabled):not(.ant-select-item-option-selected) {
    background: rgba(28, 66, 105, 0.06);
  }

  .cohort-comparison-dropdown .ant-select-item-option-selected:not(.ant-select-item-option-disabled) {
    background: rgba(28, 66, 105, 0.1);
    color: #27496b;
    font-weight: 600;
  }

  .cohort-comparison-dropdown .ant-select-item-option-selected .ant-select-item-option-state {
    color: #27496b;
  }

  .cohort-comparison-dropdown .ant-select-item-option-selected .favorite-query-option-count {
    color: #27496b;
  }
`;

const Wrapper = styled.div`
  .cohort-comparison-select {
    width: 100%;
    min-width: 0;
    max-width: 640px;
  }

  .cohort-comparison-select .ant-select-selector {
    border-radius: 12px !important;
  }

  .cohort-comparison-select .ant-select-selection-item {
    background: rgba(28, 66, 105, 0.08) !important;
    border: 1px solid rgba(28, 66, 105, 0.12) !important;
    border-radius: 10px !important;
    color: #27496b;
  }

  .cohort-comparison-select .ant-select-selection-item-content {
    color: #27496b;
  }

  .cohort-comparison-select .ant-select-selection-overflow {
    flex-wrap: nowrap;
  }

  .cohort-comparison-select .ant-select-selection-search {
    min-width: 96px;
  }

  .cohort-comparison-select .ant-select-selection-item-remove {
    color: #5f6b7a;
  }

  .cohort-comparison-select .ant-select-selection-item-remove:hover {
    color: #27496b;
  }

  @media (max-width: 960px) {
    .cohort-comparison-select {
      max-width: none;
    }
  }
`;

export default Wrapper;