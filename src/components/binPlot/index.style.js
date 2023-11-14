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
`;

export default Wrapper;
