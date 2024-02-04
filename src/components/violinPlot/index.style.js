import styled from "styled-components";

const Wrapper = styled.div`
  .ant-wrapper {
    background: white;
    padding: 0px;
    min-height: 100px;
  }
  svg.plot-container {
    position: absolute;
    top: 0px;
    user-select: none;
  }
  .axis text,
  .y-axis-title {
    font: 12px sans-serif;
    fill: steelblue;
    pointer-events: none;
    user-select: none;
  }

  .x-axis-container g.tick line {
    opacity: 0.1;
  }

  .x-axis-container g.tick text {
    font-size: 12px;
  }
  .axis--y g.tick text {
    font-size: 9px;
  }
  .axis--y g.tick line {
    stroke: #777;
    opacity: 0.5;
  }

  .axis--y .domain {
    stroke: transparent;
    opacity: 0.1;
  }
  .marker {
    font-size: 12px;
    font-weight: bold;
  }

  .domain {
    stroke: transparent;
  }
`;

export default Wrapper;
