import styled, { createGlobalStyle } from "styled-components";

export const SavedQueryListPopoverStyle = createGlobalStyle`
  .favorite-query-popover .ant-popover-inner {
    padding: 0;
  }
`;

const Wrapper = styled.div`
  .favorite-query-menu-content {
    min-width: 320px;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
  }

  .favorite-query-menu-state {
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .favorite-query-menu-state .ant-empty {
    margin-block: 0;
  }

  .favorite-query-menu-title {
    padding: 4px 8px 8px;
    font-size: 12px;
  }

  .favorite-query-menu-item {
    display: flex;
    align-items: stretch;
    gap: 8px;
    min-width: 0;
    border-radius: 8px;
  }

  .favorite-query-menu-item:hover {
    background: #f5f7fa;
  }

  .favorite-query-apply-button {
    flex: 1;
    min-width: 0;
    width: auto;
    height: auto;
    justify-content: flex-start;
    padding: 8px;
    text-align: left;
    white-space: normal;
  }

  .favorite-query-apply-button:hover,
  .favorite-query-apply-button:focus {
    background: transparent;
  }

  .favorite-query-menu-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    padding: 4px 4px 4px 0;
  }

  .favorite-query-edit-button,
  .favorite-query-delete-button {
    color: #8a94a6;
  }

  .favorite-query-edit-button:hover,
  .favorite-query-edit-button:focus {
    color: #27496b;
    background: transparent;
  }

  .favorite-query-delete-button:hover,
  .favorite-query-delete-button:focus {
    color: #c24b4b;
    background: transparent;
  }

  .favorite-query-option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    width: 100%;
  }

  .favorite-query-option-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }

  .favorite-query-option-title {
    display: block;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .favorite-query-option-count {
    flex: 0 0 auto;
    white-space: nowrap;
    font-size: 12px;
    color: rgba(39, 73, 107, 0.82);
  }

  .favorite-query-option-count strong {
    color: inherit;
    font-weight: 700;
  }

  .favorite-query-option-description-wrap {
    display: block;
    min-width: 0;
  }

  .favorite-query-option-description {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .favorite-query-option-description strong {
    color: inherit;
    font-weight: 600;
  }
`;

export default Wrapper;