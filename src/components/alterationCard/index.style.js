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

  .notes-block {
    margin-top: 12px;
  }
  .notes-textarea {
    width: 100%;
    resize: vertical;
  }

  /* Editable affordances */
  .editable-field {
    position: relative;
  }
  .editable-field .edit-btn {
    opacity: 0;
    transition: opacity 0.15s ease-in-out;
    background: transparent;
    border: 1px solid #c8d1dc;
    color: #445566;
    border-radius: 4px;
    padding: 2px 6px;
    cursor: pointer;
    font-size: 0.85rem;
    margin-left: 8px;
  }
  .editable-field:hover .edit-btn {
    opacity: 1;
  }

  /* Notes display/edit */
  .note-display {
    width: 100%;
    min-height: 120px;
    padding: 10px 12px;
    white-space: pre-wrap;
    word-wrap: break-word;
    background: #f1f3f5;
    color: #212529;
    border-radius: 6px;
    cursor: pointer;
    box-sizing: border-box;
    margin-top: 6px;
  }
  .note-display.is-empty {
    color: #6c757d;
  }
  .note-display.is-empty::before {
    content: attr(data-placeholder);
  }
  .note-textarea {
    width: 100%;
    min-height: 120px;
    padding: 10px 12px;
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.5;
    border: none;
    outline: none;
    border-radius: 6px;
    background: #fff;
    display: block;
    box-sizing: border-box;
    margin-top: 6px;
  }

  /* Tier overlay select */
  .tier-control {
    position: relative;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }
  .tier-select {
    position: absolute;
    top: 0;
    left: 0;
    width: 32px;
    height: 32px;
    opacity: 0;
    cursor: pointer;
  }
`;
