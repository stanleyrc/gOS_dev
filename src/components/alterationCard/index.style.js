import styled from "styled-components";

export default styled.div`
  .variant-card {
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 16px;
    margin: 8px 0;
    background: #fff;
  }

  .variant-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e9ecef;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }

  .gene-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .gene-title {
    margin: 0;
    display: inline;
    color: #007bff;       /* visually distinguish gene */
    margin-right: 8px;    /* spacing before variant */
  }

  .variant-title {
    display: inline;      /* place on same line as gene */
    font-weight: 700;
    font-size: 1.05rem;
    color: #343a40;
    margin-top: 0;        /* remove top spacing for inline layout */
  }

  .gene-right {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .pill {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    background: #eef2f7;
    color: #445566;
    border: 1px solid #c8d1dc;
    white-space: nowrap;
  }
  .role-pill {
    background: transparent;
    color: #1a73e8;
    border-color: #1a73e8;
    border-width: 2px;
    border-style: solid;
    border-radius: 6px;
  }
  .effect-pill {
    background: transparent;
    color: #bd5b00;
    border-color: #f0ad4e;
    border-width: 2px;
    border-style: solid;
    border-radius: 6px;
  }
  .therapeutic-tag {
    background: #e6f4ea;
    color: #1e7e34;
    border-color: #28a745;
  }
  .resistance-tag {
    background: #fdecea;
    color: #c82333;
    border-color: #dc3545;
  }

  .variant-body {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 16px;
  }
  @media (max-width: 768px) {
    .variant-body {
      grid-template-columns: 1fr;
    }
  }

  .desc-title {
    font-weight: 600;
    margin: 8px 0 4px;
    color: #343a40;
  }
  .variant-desc .desc-text {
    color: #495057;
  }

  .metrics-block {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 10px 12px;
    align-self: start;
  }
  .metric-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }
  .metric-label {
    color: #6c757d;
  }
  .metric-value {
    color: #212529;
  }
  .monospace {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
  }

  .therapeutics-tags,
  .resistance-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
`;
