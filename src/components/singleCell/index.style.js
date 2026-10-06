import styled from "styled-components";

const Wrapper = styled.div`
  .sc-alert {
    margin-bottom: 8px;
  }
  .sc-heatmap-container {
    position: relative;
    width: 100%;
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
    border: 1px dashed #d9d9d9;
  }
  .sc-axis {
    position: relative;
    margin-top: 2px;
    font-size: 11px;
    color: #595959;
  }
  .sc-axis-label {
    position: absolute;
    top: 0;
    text-align: center;
    overflow: hidden;
    white-space: nowrap;
    user-select: none;
  }
  .sc-axis-link {
    cursor: pointer;
  }
  .sc-axis-link:hover {
    color: #1677ff;
    text-decoration: underline;
  }
  .sc-heatmap-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
  }
  .sc-hint {
    font-size: 12px;
  }
  .sc-tooltip {
    position: absolute;
    z-index: 10;
    pointer-events: none;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    padding: 6px 8px;
    font-size: 12px;
    line-height: 1.5;
    max-width: 360px;
    white-space: nowrap;
  }
  .sc-tooltip-key {
    color: #8c8c8c;
  }
  .sc-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
  }
  .sc-legend-swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1px solid rgba(0, 0, 0, 0.15);
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
    border-left: 4px solid #d9d9d9;
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
  .sc-row-labels {
    display: flex;
    flex-direction: column;
    font-size: 11px;
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
    background: #fafafa;
  }
  .sc-history-item.active {
    border-color: #91caff;
    background: #e6f4ff;
  }
  .sc-prevalence svg text {
    font-size: 11px;
    fill: #595959;
  }
  .sc-igv {
    min-height: 320px;
    margin-top: 8px;
  }
  .sc-level {
    padding: 0 6px;
    border: 1px solid #f0f0f0;
    border-radius: 4px;
  }
  .sc-height-handle {
    height: 6px;
    margin: 2px 0;
    border-radius: 3px;
    background: #f0f0f0;
    cursor: row-resize;
  }
  .sc-height-handle:hover {
    background: #1677ff;
  }
  .sc-resize-handle {
    cursor: col-resize;
    background: #f0f0f0;
    border-radius: 1px;
  }
  .sc-resize-handle:hover {
    background: #1677ff;
  }
  .sc-toolbar {
    margin-bottom: 8px;
  }
  .sc-hover-band {
    position: absolute;
    right: 0;
    pointer-events: none;
    box-sizing: border-box;
    border: 1px solid #1677ff;
    background: rgba(22, 119, 255, 0.08);
  }
  .sc-select-band {
    position: absolute;
    right: 0;
    pointer-events: none;
    box-sizing: border-box;
    border-top: 1px solid rgba(22, 119, 255, 0.9);
    border-bottom: 1px solid rgba(22, 119, 255, 0.9);
    background: rgba(22, 119, 255, 0.12);
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
    font-size: 10px;
    white-space: nowrap;
    color: #595959;
  }
  .sc-violin-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
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
    border: 1px solid #f0f0f0;
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
    border: 1px solid rgba(0, 0, 0, 0.1);
  }
  .sc-legend-hollow {
    background: transparent !important;
    border: 1.5px solid #8c8c8c !important;
    border-radius: 50% !important;
  }
`;

export default Wrapper;
