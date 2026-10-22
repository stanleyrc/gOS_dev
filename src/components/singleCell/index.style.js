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
  /* focus mode: the heatmap card fills the viewport above the app chrome */
  .ant-card.sc-focus-card {
    position: fixed;
    inset: 0;
    z-index: 990;
    margin: 0;
    border-radius: 0;
    display: flex;
    flex-direction: column;
    background: var(--sc-panel, #fff);
  }
  .sc-focus-card > .ant-card-head {
    flex: none;
  }
  .sc-focus-card > .ant-card-head .ant-card-head-wrapper {
    flex-wrap: wrap;
  }
  .sc-focus-card > .ant-card-head .ant-card-head-title {
    overflow: visible;
    flex: 0 1 auto;
    min-width: 0;
  }
  .sc-focus-card > .ant-card-head .ant-card-extra {
    margin-left: auto;
  }
  .sc-focus-card > .ant-card-body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 4px 8px;
  }
  .sc-focus-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
  .sc-focus-more-body {
    width: min(1100px, 90vw);
    max-height: 70vh;
    overflow: auto;
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
  .sc-fig-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 14px;
    margin-top: 6px;
    font-size: var(--sc-fs-tick, 11.5px);
    color: var(--sc-text-secondary, #434343);
    line-height: 1.6;
  }
  .sc-fig-legend-title {
    color: var(--sc-muted, #666);
    margin-right: 2px;
  }
  .sc-fig-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  .sc-fig-subtitle {
    font-size: var(--sc-fs-label, 12.5px);
    font-weight: 600;
    color: var(--sc-text, #1f1f1f);
    margin-bottom: 4px;
  }
  .sc-fig-subtitle span {
    font-weight: 400;
    color: var(--sc-muted, #666);
    margin-left: 6px;
  }
  .sc-fig-phead {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    margin: 2px 0 6px;
    line-height: 1.35;
  }
  .sc-fig-letter {
    font-size: 17px;
    font-weight: 700;
    color: var(--sc-text, #1f1f1f);
    min-width: 14px;
  }
  .sc-fig-ptitle {
    font-size: var(--sc-fs-label, 12.5px);
    font-weight: 600;
    color: var(--sc-text, #1f1f1f);
  }
  .sc-fig-pfig {
    font-size: var(--sc-fs-tick, 11.5px);
    color: var(--sc-text-secondary, #434343);
    border: 1px solid var(--sc-border, #d9d9d9);
    border-radius: 3px;
    padding: 0 4px;
    line-height: 16px;
  }
  .sc-fig-phint {
    font-size: var(--sc-fs-tick, 11.5px);
    color: var(--sc-muted, #666);
  }
  .sc-fig-pextra {
    margin-left: auto;
  }
  /* Paper figures mode (components/singleCell/paper) */
  .sc-paperpage-sheet {
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    margin: 4px 0 12px;
  }
  .sc-paperpage-region {
    position: absolute;
    border: 1.5px solid #1677ff;
    background: rgba(22, 119, 255, 0.05);
    border-radius: 3px;
    pointer-events: none;
  }
  .sc-paperpage-hover {
    position: absolute;
    background: rgba(22, 119, 255, 0.16);
    pointer-events: none;
  }
  .sc-paperpage-sel {
    position: absolute;
    background: rgba(22, 119, 255, 0.28);
    outline: 1px solid rgba(22, 119, 255, 0.6);
    pointer-events: none;
  }
  .sc-paperpage-brush {
    position: absolute;
    background: rgba(22, 119, 255, 0.12);
    border: 1px dashed #1677ff;
    pointer-events: none;
  }
  .sc-paperslot-wrap {
    margin: 6px 0 10px;
    padding: 6px 8px;
    border: 1px solid rgba(22, 119, 255, 0.35);
    border-radius: 4px;
    background: var(--sc-panel, #fff);
  }
  .sc-paperslot-head {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 4px;
  }
  .sc-paperslot-head .ant-segmented {
    margin-left: auto;
  }
  .sc-paperslot-sub {
    font-size: 12px;
    color: var(--sc-muted, #666);
    margin-top: 4px;
  }
  .sc-paperslot-cell {
    padding: 1px 0;
  }
  /* highlight rings: centred on the mark (translate -50%), thin accent line, no layout shift */
  .sc-paperpage-ring {
    position: absolute;
    box-sizing: border-box;
    border: 1.5px solid #1677ff;
    border-radius: 50%;
    pointer-events: none;
  }
  .sc-paperpage-ring.is-sel {
    border-color: #1677ff;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8);
  }
  .sc-paperlive {
    border: 1px solid var(--sc-border, #d9d9d9);
    border-left: 3px solid #1677ff;
    border-radius: 4px;
    padding: 8px 10px 4px;
    margin: 6px 0 10px;
    background: var(--sc-card-bg, #fff);
    scroll-margin-top: 80px;
  }
  .sc-paperlive-head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
  }
  .sc-paperctl-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
    min-height: 32px;
    margin: 4px 0 2px;
  }
  .sc-paperctl {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    padding: 2px 8px 2px 6px;
    background: rgba(22, 119, 255, 0.05);
    border: 1px solid rgba(22, 119, 255, 0.28);
    border-radius: 4px;
  }
  .sc-paperctl-letter {
    font-size: 11px;
    font-weight: 600;
    color: #1677ff;
    min-width: 20px;
  }
  .sc-paperctl-row {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 4px;
  }
  .sc-paperctl-wash {
    position: absolute;
    background: rgba(255, 255, 255, 0.65); /* other marks dimmed to about 35% */
    pointer-events: none;
  }
  .sc-paperctl-dot {
    position: absolute;
    width: 6px;
    height: 6px;
    margin: -3px 0 0 -3px;
    border-radius: 50%;
    border: 0.5px solid rgba(0, 0, 0, 0.55);
    box-sizing: border-box;
  }
  .sc-paperctl-dot.is-ring {
    margin: 0;
    box-sizing: border-box;
    border: 1.5px solid #1677ff;
    background: transparent;
    pointer-events: none;
  }
  .sc-paperctl-rect {
    position: absolute;
    outline: 1.5px solid #1677ff;
    background: rgba(22, 119, 255, 0.12);
    pointer-events: none;
  }
  .sc-paperlens {
    outline: 1.5px solid rgba(22, 119, 255, 0.7);
    background: #fff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  }
  .sc-paperzoom-badge {
    position: absolute;
    z-index: 4;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(22, 119, 255, 0.4);
    border-radius: 3px;
    padding: 0 4px;
    pointer-events: none;
  }
  .sc-cellgraph-lens {
    background: #fff;
    border: 1px solid rgba(22, 119, 255, 0.55);
    border-radius: 4px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
    cursor: default;
    user-select: text;
  }
  .sc-cellgraph-lens .ant-wrapper {
    background: transparent !important;
    min-height: 0 !important;
  }
  .sc-cellgraph-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
    padding: 3px 8px;
    border-bottom: 1px solid #f0f0f0;
  }
  .sc-paperzoom {
    outline: 1px solid rgba(22, 119, 255, 0.6);
  }
  .sc-paperpage-walks {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    margin: 4px 0;
  }
  .sc-paperpage-selbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 4px 8px;
    margin: 4px 0;
    background: rgba(22, 119, 255, 0.06);
    border: 1px solid rgba(22, 119, 255, 0.3);
    border-radius: 4px;
  }
  .sc-paperpage-note {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    padding: 2px 0;
    border-bottom: 1px dashed var(--sc-border, #eee);
  }
  .sc-paperlinks {
    margin-bottom: 12px;
  }
  .sc-paperlinks-head {
    margin-bottom: 6px;
  }
  .sc-paperlinks-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sc-paperlinks-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 92px;
    padding: 4px;
    border: 1px solid var(--sc-border, #e5e5e5);
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 12px;
  }
  .sc-paperlinks-item:hover {
    border-color: #1677ff;
  }
  .sc-paperlinks-item img {
    width: 80px;
    height: 80px;
    object-fit: contain;
  }
  .sc-paper-modebar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .sc-paper-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .sc-paper-title {
    font-size: var(--sc-fs-label, 12.5px);
    margin-bottom: 6px;
    color: var(--sc-text, #1f1f1f);
  }
  .sc-paper-zoom-tools {
    margin-bottom: 4px;
  }
  .sc-paper-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: #fa8c16;
    margin-left: 4px;
    vertical-align: middle;
  }
  .sc-paper-subhead {
    margin: 12px 0 6px;
    font-size: var(--sc-fs-tick, 11.5px);
    color: var(--sc-muted, #666);
  }
  .sc-paper-panels {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .sc-paper-panel {
    border: 1px solid var(--sc-border, #e5e5e5);
    border-radius: 4px;
    padding: 6px;
    cursor: pointer;
    background: #fff;
  }
  .sc-paper-panel:hover,
  .sc-paper-panel:focus {
    border-color: #1677ff;
    outline: none;
  }
  .sc-paper-panel-thumb {
    height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .sc-paper-panel-thumb img {
    max-width: 100%;
    max-height: 110px;
  }
  .sc-paper-panel-meta {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 4px;
    font-size: 12px;
  }
  /* Paper figure style: the manuscript's Helvetica type and black letters */
  .sc-fig-paper .sc-fig-phead,
  .sc-fig-paper .sc-fig-legend,
  .sc-fig-paper .sc-fig-caption {
    font-family: Helvetica, "Helvetica Neue", Arial, "Liberation Sans", sans-serif;
  }
  .sc-fig-paper .sc-fig-letter {
    font-size: 20px;
    color: var(--sc-text, #000);
  }
  .sc-fig-section {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    padding: 2px 0 8px;
    margin-bottom: 10px;
    border-bottom: 1px solid var(--sc-border-soft, #f0f0f0);
  }
  .sc-fig-section h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    color: var(--sc-text, #1f1f1f);
  }
  .sc-fig-section .sc-fig-section-sub {
    font-size: var(--sc-fs-tick, 11.5px);
    color: var(--sc-muted, #666);
  }
  .sc-fig-patient {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: var(--sc-text, #1f1f1f);
    margin-right: 6px;
  }
  .sc-fig-block {
    padding-top: 12px;
    margin-top: 12px;
    border-top: 1px solid var(--sc-border-soft, #f0f0f0);
  }
  .sc-fig-amps {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin: 2px 0 6px;
    font-size: var(--sc-fs-tick, 11.5px);
  }
  .sc-fig-amp {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--sc-border, #d9d9d9);
    border-radius: 12px;
    padding: 0 2px 0 8px;
    opacity: 0.6;
  }
  .sc-fig-amp.is-on {
    opacity: 1;
  }
  .sc-fig-amp.is-main {
    border-color: var(--sc-text-secondary, #8c8c8c);
  }
  .sc-fig-amp .ant-btn {
    padding: 0 4px;
    height: 20px;
    min-width: 0;
  }
  .sc-fig-amp-n {
    color: var(--sc-muted, #666);
    margin-left: 4px;
    font-weight: 400;
  }
  .sc-fig-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    padding: 16px;
    text-align: center;
    font-size: var(--sc-fs-tick, 11.5px);
    color: var(--sc-muted, #666);
    border: 1px dashed var(--sc-border-soft, #f0f0f0);
    border-radius: 6px;
    margin-top: 6px;
  }
  .sc-fig-caption {
    font-size: var(--sc-fs-tick, 11.5px);
    color: var(--sc-muted, #666);
    margin-top: 4px;
    line-height: 1.5;
  }
  /* Paper figures: sticky cell-selection bar and compact legend keys */
  .sc-fig-selbar-wrap {
    margin-bottom: 10px;
  }
  /* while cells are selected the bar floats at the bottom of the screen */
  .sc-fig-selbar.is-active {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: 1001;
    max-width: min(900px, 92vw);
  }
  .sc-fig-selbar {
    display: flex;
    align-items: center;
    min-height: 36px;
    padding: 4px 12px;
    border: 1px solid var(--sc-border-soft, #f0f0f0);
    border-radius: 8px;
    background: var(--sc-panel, #fff);
    font-size: var(--sc-fs-tick, 11.5px);
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .sc-fig-selbar.is-active {
    border-color: rgba(22, 119, 255, 0.45);
    box-shadow: 0 2px 10px rgba(22, 119, 255, 0.12);
  }
  .sc-fig-keys {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin-top: 6px;
    font-size: var(--sc-fs-tick, 11.5px);
    color: var(--sc-muted, #666);
  }
  .sc-fig-key {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
  }
  .sc-fig-key b {
    font-weight: 600;
    color: var(--sc-text, #262626);
  }
  .sc-fig-key > span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .sc-fig-swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex: none;
  }
  .sc-fig-ramp {
    display: inline-block;
    width: 90px;
    height: 9px;
    border-radius: 2px;
    border: 1px solid var(--sc-border-soft, #f0f0f0);
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
  /* igv.js has no dark theme: it sits in a deliberately light, framed inset
     (the dark SVG re-tint skips .sc-light-island, see plotTheme.svgRemapCss) */
  .sc-light-island {
    border: 1px solid var(--sc-border-soft, #f0f0f0);
    border-radius: 6px;
    padding: 4px 6px;
  }
  html[data-theme="dark"] & .sc-light-island {
    background: #ffffff;
    color: rgba(0, 0, 0, 0.88);
    color-scheme: light;
    border-color: var(--sc-border, #424242);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.04);
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
  .sc-gene-label-click {
    pointer-events: none;
  }
  .sc-gene-label-hover {
    color: var(--sc-link, #1677ff);
    text-decoration: underline;
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
  .sc-umap-controls {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 4;
    background: var(--sc-card-bg, rgba(255, 255, 255, 0.85));
    border-radius: 4px;
    padding: 2px;
  }
  .sc-umap-zoomlabel {
    font-size: 11.5px;
    opacity: 0.65;
    min-width: 30px;
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
  .sc-nowrap-head .ant-table-thead > tr > th {
    white-space: nowrap;
  }
  .sc-none {
    display: block;
    margin: 2px 0 6px;
  }
  .sc-cell-tracks-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  /* sortable headers keep the header weight (global.css lightens
     .ant-table-column-title, which mixed bold and regular headers) */
  .ant-table-thead .ant-table-column-title {
    font-weight: inherit;
  }
  .sc-legend-hollow {
    background: transparent !important;
    border: 1.5px solid var(--sc-axis, #8c8c8c) !important;
    border-radius: 50% !important;
  }
  /* ---- cohort: headline findings, tab groups, view purpose ---- */
  .sc-headline-item {
    border-left: 3px solid var(--sc-accent);
    padding-left: 12px !important;
  }
  .sc-headline-number {
    font-size: 30px;
    line-height: 1.1;
    font-weight: 600;
    color: var(--sc-accent);
    font-variant-numeric: tabular-nums;
  }
  .sc-headline-total {
    font-size: 16px;
    font-weight: 400;
    color: var(--sc-muted);
  }
  .sc-headline-text {
    font-size: 15.5px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--sc-text);
    margin: 4px 0 2px;
  }
  .sc-headline-detail {
    font-size: var(--sc-fs-label, 12.5px);
    line-height: 1.45;
    color: var(--sc-muted);
  }
  .sc-headline-foot {
    margin-top: 4px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 4px;
  }
  .sc-headline-sep {
    color: var(--sc-faint);
  }
  .sc-headline-patient {
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    color: var(--sc-muted);
    font-size: var(--sc-fs-tick, 11.5px);
  }
  .sc-headline-patient:hover {
    color: var(--sc-accent);
  }
  .sc-cohort-tabs .ant-tabs-tab:has(.sc-tab-group-start-label) {
    margin-left: 10px;
    padding-left: 10px;
    border-left: 1px solid var(--sc-border);
  }
  .sc-view-purpose {
    color: var(--sc-muted);
    font-size: var(--sc-fs-body, 13.5px);
    margin: -6px 0 6px;
  }
  .sc-cohort-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 16px;
  }
  .sc-text-button {
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .sc-text-button:hover .ant-typography {
    text-decoration: underline;
  /* Evidence tab: the chosen row of a findings / preset table */
  .ant-table-tbody > tr.sc-row-active > td {
    background: var(--sc-select-fill, rgba(22, 119, 255, 0.14));
  }
  .sc-site-head .ant-statistic-content {
    font-size: 20px;
  }
`;

export default Wrapper;
