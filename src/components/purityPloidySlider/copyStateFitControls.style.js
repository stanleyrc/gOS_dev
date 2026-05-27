import styled from "styled-components";

const Wrapper = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: flex-start;
  margin-bottom: 24px;
  font-size: 14px;
  line-height: 20px;

  .copy-state-fit-panel {
    box-sizing: border-box;
    width: fit-content;
    max-width: min(720px, 100%);
    padding: 10px 12px 12px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 8px;
    background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .copy-state-fit-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 10px;
  }

  .copy-state-fit-title {
    color: rgba(0, 0, 0, 0.78);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  .copy-state-fit-toolbar {
    display: flex;
    justify-content: flex-end;
  }

  .copy-state-fit-readout {
    display: grid;
    grid-template-columns: repeat(4, minmax(112px, 1fr));
    gap: 8px;
  }

  .copy-state-fit-metric {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid rgba(0, 0, 0, 0.07);
    border-radius: 6px;
    background: #fff;
  }

  .copy-state-fit-metric-label {
    color: rgba(0, 0, 0, 0.48);
    font-size: 11px;
    line-height: 16px;
  }

  .copy-state-fit-metric-value {
    color: rgba(0, 0, 0, 0.86);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      "Liberation Mono", "Courier New", monospace;
    font-size: 17px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    line-height: 22px;
  }

  @media (max-width: 640px) {
    .copy-state-fit-panel {
      width: 100%;
      max-width: 100%;
    }

    .copy-state-fit-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    .copy-state-fit-toolbar {
      justify-content: flex-start;
    }

    .copy-state-fit-readout {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;

export default Wrapper;
