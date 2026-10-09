import styled from "styled-components";

const Wrapper = styled.div`
  /* ---- density: one set of card chrome / spacing values for every
     single-cell tab (pairs with density.js for gutters) ---- */
  .ant-card-small > .ant-card-head {
    min-height: 32px;
    padding: 0 10px;
    font-size: var(--sc-fs-title, 15px);
  }
  .ant-card-small > .ant-card-head .ant-card-head-title,
  .ant-card-small > .ant-card-head .ant-card-extra {
    padding: 3px 0;
  }
  .ant-card-small > .ant-card-body {
    padding: 6px 10px;
  }
  .ant-card + .ant-card {
    margin-top: 8px;
  }
  h5.ant-typography.sc-section-title {
    margin: 8px 0 2px;
    font-size: var(--sc-fs-title, 15px);
  }
  h5.ant-typography.sc-section-title:first-child {
    margin-top: 0;
  }
  .ant-empty-normal {
    margin-block: 6px;
  }
  .ant-empty-normal .ant-empty-image {
    height: 28px;
    margin-bottom: 4px;
  }
  .ant-statistic-content {
    font-size: var(--sc-fs-stat, 22px);
  }
  .ant-statistic-title {
    margin-bottom: 0;
    font-size: 13px;
    color: var(--sc-muted, #666);
  }
  .sc-hint-line {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    margin-top: 2px;
    font-size: var(--sc-fs-label, 12.5px);
    line-height: 20px;
    cursor: help;
  }
  .sc-hint-line > .ant-typography {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--sc-fs-label, 12.5px);
    color: var(--sc-muted, #666);
  }
  .sc-hint-icon {
    flex: none;
    font-size: 13px;
    color: var(--sc-faint, #8c8c8c);
    cursor: help;
  }
  .sc-hint-icon:hover {
    color: var(--sc-accent, #1677ff);
  }
  /* compact inline note (replaces full-width info banners) */
  .sc-note {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--sc-muted, #666);
  }
  /* label / value grid (single-walk card facts) */
  .sc-walk-card,
  .sc-walk-card .ant-typography {
    font-size: 12px;
  }
  .sc-walk-facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    column-gap: 10px;
    row-gap: 2px;
    align-items: baseline;
  }
  .sc-alert {
    margin-bottom: 4px;
    padding: 3px 8px;
    font-size: 13px;
  }
  .sc-alert.ant-alert-with-description {
    padding: 4px 10px;
  }
  .sc-alert.ant-alert-with-description .ant-alert-message {
    margin-bottom: 0;
    font-size: var(--sc-fs-body, 13.5px);
  }
  .sc-heatmap-container {
    position: relative;
    width: 100%;
  }
  .sc-swatch {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 4px;
    border-radius: 2px;
    vertical-align: baseline;
  }
  .sc-strip-labels {
    position: relative;
    flex: none;
  }
  .sc-strip-label {
    position: absolute;
    bottom: 2px;
    max-height: 100%;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 12.5px;
    font-weight: 500;
    color: var(--sc-text-secondary, #434343);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
    user-select: none;
  }
  .sc-heatmap-row {
    position: relative;
    display: flex;
    gap: 4px;
    align-items: flex-start;
  }
  .sc-heatmap-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--sc-border, #d9d9d9);
  }
  .sc-axis {
    position: relative;
    margin-top: 2px;
    font-size: var(--sc-fs-label, 12.5px);
    color: var(--sc-text-secondary, #434343);
  }
  .sc-axis-label {
    position: absolute;
    top: 0;
    text-align: center;
    overflow: hidden;
    white-space: nowrap;
    user-select: none;
  }
  .sc-axis-tick {
    position: absolute;
    font-size: var(--sc-fs-tick, 11.5px);
    line-height: 14px;
    padding-left: 2px;
    border-left: 1px solid var(--sc-axis, #8c8c8c);
    color: var(--sc-muted, #666);
    white-space: nowrap;
    user-select: none;
    pointer-events: none;
  }
  .sc-axis-link {
    cursor: pointer;
  }
  .sc-axis-link:hover {
    color: var(--sc-accent, #1677ff);
    text-decoration: underline;
  }
  .sc-heatmap-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 14px;
    margin-top: 4px;
  }
  .sc-hint {
    font-size: 13px;
  }
  .sc-tooltip {
    position: absolute;
    z-index: 10;
    pointer-events: none;
    background: var(--sc-raised, #fff);
    color: var(--sc-text, #1f1f1f);
    border: 1px solid var(--sc-border, #d9d9d9);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    padding: 6px 9px;
    font-size: var(--sc-fs-body, 13.5px);
    line-height: 1.5;
    max-width: 360px;
    white-space: nowrap;
  }
  .sc-tooltip-key {
    color: var(--sc-muted, #666);
  }
  .sc-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 13px;
  }
  .sc-legend-swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1px solid var(--sc-border, rgba(0, 0, 0, 0.15));
    border-radius: 2px;
  }
  .sc-cell-tracks-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sc-cell-block {
    margin-bottom: 16px;
    padding-left: 10px;
    border-left: 4px solid var(--sc-border, #d9d9d9);
  }
  .sc-cell-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0 8px;
  }
  .sc-track-note {
    margin-bottom: 8px;
  }
  /* Popups / drawers: one tight lane per cell, the cell name inline above
     its tracks and the track cards stripped to a one-line header. */
  .sc-compact-tracks {
    .sc-cell-block {
      margin-bottom: 4px;
      padding-left: 6px;
      border-left-width: 3px;
    }
    .sc-cell-title {
      margin: 0 0 2px;
      gap: 6px;
      font-size: 13px;
      line-height: 20px;
    }
    .sc-cell-title .ant-tag {
      margin-inline-end: 0;
      padding-inline: 4px;
      font-size: 12px;
      line-height: 17px;
    }
    .sc-cell-title .ant-btn-sm {
      height: 20px;
      padding-block: 0;
    }
    .sc-track-note {
      margin-bottom: 2px;
    }
    .sc-track-lane + .sc-track-lane {
      margin-top: 2px;
    }
    .ant-card-small > .ant-card-head {
      min-height: 22px;
      padding: 0 6px;
      font-size: 12px;
    }
    .ant-card-small > .ant-card-head .ant-card-head-title,
    .ant-card-small > .ant-card-head .ant-card-extra {
      padding: 1px 0;
    }
    .ant-card-small > .ant-card-head .ant-btn-sm {
      width: 18px;
      min-width: 18px;
      height: 18px;
    }
    .ant-card-small > .ant-card-body {
      padding: 0 4px;
    }
  }
  .sc-row-labels {
    display: flex;
    flex-direction: column;
    font-size: var(--sc-fs-tick, 11.5px);
    color: var(--sc-text-secondary, #434343);
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
  }
  .sc-row-labels > div {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sc-history {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }
  .sc-history-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .sc-history-item:hover {
    background: var(--sc-panel-alt, #fafafa);
  }
  .sc-history-item.active {
    border-color: var(--sc-accent, #91caff);
    background: var(--sc-accent-soft, #e6f4ff);
  }
  .sc-prevalence svg text {
    font-size: 12px;
    fill: var(--sc-text-secondary, #434343);
  }
  .sc-igv {
    min-height: 320px;
    margin-top: 8px;
  }
  .sc-level {
    padding: 0 6px;
    border: 1px solid var(--sc-border-soft, #f0f0f0);
    border-radius: 4px;
  }
  .sc-height-handle {
    height: 6px;
    margin: 2px 0;
    border-radius: 3px;
    background: var(--sc-border-soft, #f0f0f0);
    cursor: row-resize;
  }
  .sc-height-handle:hover {
    background: var(--sc-accent, #1677ff);
  }
  .sc-resize-handle {
    cursor: col-resize;
    background: var(--sc-border-soft, #f0f0f0);
    border-radius: 1px;
  }
  .sc-resize-handle:hover {
    background: var(--sc-accent, #1677ff);
  }
  /* Heatmap controls stay reachable while scrolling, below the pinned
     header, tabs and navigation (--sc-sticky-top from the tab). */
  .sc-toolbar-sticky {
    position: sticky;
    top: var(--sc-sticky-top, 0px);
    z-index: 6;
    background: var(--sc-panel, #fff);
    padding: 3px 0 1px;
    margin-top: -3px;
  }
  .sc-saved-groups {
    width: 100%;
    padding: 2px 8px;
    margin-bottom: 4px;
  }
  .sc-group-bar {
    width: 100%;
    padding: 4px 8px;
    margin-bottom: 6px;
    border-radius: 6px;
    background: var(--sc-accent-soft, #f0f5ff);
  }
  .sc-events-table .ant-table-thead > tr > th {
    font-size: 12.5px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--sc-text-secondary, #434343);
    background: var(--sc-panel-alt, #fafafa);
  }
  .sc-events-table .ant-table-tbody > tr:nth-child(even) > td {
    background: var(--sc-panel-alt, #fcfcfc);
  }
  .sc-events-table .ant-table-tbody > tr:hover > td {
    background: var(--sc-accent-soft, #f0f5ff);
  }
  .sc-toolbar-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 1px 0;
  }
  .sc-toolbar-row + .sc-toolbar-row {
    padding-left: 12px;
    border-left: 1px solid var(--sc-border-soft, #f0f0f0);
  }
  .sc-toolbar-row-label {
    flex: none;
    padding-top: 2px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--sc-muted, #666) !important;
  }
  /* control groups (VIEW, SNVS, ...) flow side by side and wrap */
  .sc-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    column-gap: 12px;
    row-gap: 2px;
    margin-bottom: 4px;
  }
  .sc-toolbar .ant-space {
    row-gap: 3px !important;
    column-gap: 8px !important;
  }
  .sc-hover-band {
    position: absolute;
    right: 0;
    pointer-events: none;
    box-sizing: border-box;
    border: 1px solid var(--sc-select, #1677ff);
    background: rgba(22, 119, 255, 0.08);
  }
  .sc-select-band {
    position: absolute;
    right: 0;
    pointer-events: none;
    box-sizing: border-box;
    background: var(--sc-select-fill, rgba(22, 119, 255, 0.14));
  }
  .sc-gene-labels {
    position: relative;
    overflow: visible;
  }
  .sc-gene-label {
    position: absolute;
    top: 4px;
    transform: rotate(60deg);
    transform-origin: 0 0;
    font-size: var(--sc-fs-tick, 11.5px);
    white-space: nowrap;
    color: var(--sc-text-secondary, #434343);
  }
  .sc-violin-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }
  .sc-pinned-overlay {
    position: absolute;
    pointer-events: none;
    z-index: 4;
  }
  .sc-pinned-line {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1.5px dashed rgba(114, 46, 209, 0.85);
  }
  .sc-pinned-label {
    position: absolute;
    top: 2px;
    left: 3px;
    padding: 0 3px;
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-pinned, #531dab);
    background: var(--sc-label-bg, rgba(255, 255, 255, 0.85));
    border-radius: 2px;
    white-space: nowrap;
  }
  .sc-width-handle {
    position: absolute;
    left: -5px;
    top: 0;
    width: 6px;
    height: 100%;
    z-index: 3;
    cursor: col-resize;
    border-radius: 2px;
  }
  .sc-width-handle:hover {
    background: rgba(22, 119, 255, 0.5);
  }
  .sc-hover-clade {
    border-color: var(--sc-hover, #fa541c);
    background: var(--sc-hover-fill, rgba(250, 84, 28, 0.08));
  }
  .sc-gene-zoom {
    display: flex;
    justify-content: flex-end;
  }
  .sc-side-axis {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    overflow: hidden;
    white-space: nowrap;
  }
  .sc-umap {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
  }
  .sc-umap-plot {
    position: relative;
    border: 1px solid var(--sc-border-soft, #f0f0f0);
    border-radius: 4px;
  }
  .sc-umap-legend {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sc-umap-ramp {
    height: 10px;
    border-radius: 2px;
    border: 1px solid var(--sc-border, rgba(0, 0, 0, 0.1));
  }
  .sc-legend-hollow {
    background: transparent !important;
    border: 1.5px solid var(--sc-axis, #8c8c8c) !important;
    border-radius: 50% !important;
  }
`;

export default Wrapper;
