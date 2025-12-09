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

  .axis--y g.tick line {
    stroke: #777;
  }

  .axis--y .domain {
    stroke: #777;
  }
  .marker {
    font-size: 12px;
    font-weight: bold;
  }
  .zoom-background {
    stroke: #777;
    fill: transparent;
    stroke-width: 0.5;
    opacity: 0.19;
    pointer-events: all;
  }
  .clickable-marker {
    cursor: pointer;
    pointer-events: all;
    font-weight: normal;
    fill: #333;
    font-size: 12px;
  }
`;

export default Wrapper;
