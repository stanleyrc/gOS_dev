import styled from "styled-components";

const Wrapper = styled.g`
  .copy-state-separator-line,
  .copy-state-separator-hit-target {
    cursor: ew-resize;
    pointer-events: stroke;
  }

  .copy-state-separator-line {
    stroke: #ffd6d6;
    stroke-dasharray: 4 1;
  }

  .copy-state-separator-label,
  .copy-state-separator-segment-mean {
    fill: rgb(179, 150, 150);
    font-size: 10px;
    text-anchor: middle;
  }

  .copy-state-separator-hit-target {
    fill: none;
    stroke: transparent;
    stroke-width: 12;
  }
`;

export default Wrapper;
