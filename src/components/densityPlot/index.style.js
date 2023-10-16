import styled from "styled-components";

const Wrapper = styled.div`
  .ant-wrapper {
    background: white;
    padding: 0px;
    min-height: 100px;
  }
  svg.plot-container {
    user-select: none;
  }
  .axis text,
  .y-axis-title {
    font: 12px sans-serif;
    fill: steelblue;
    pointer-events: none;
    user-select: none;
  }

  .x-axis-title {
    font: 12px sans-serif;
    pointer-events: none;
    user-select: none;
  }

  .axis--y g.tick line {
    stroke: #777;
  }

  .axis--y .domain {
    stroke: #777;
    display: none;
  }
  .axis--x .domain {
    stroke: #777;
    display: none;
  }
  .marker {
    font-size: 12px;
    font-weight: bold;
  }
`;

export default Wrapper;
