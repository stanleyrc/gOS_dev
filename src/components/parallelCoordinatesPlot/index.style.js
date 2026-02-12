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
  .axis text {
    font: 12px sans-serif;
    fill: steelblue;
    pointer-events: none;
    user-select: none;
  }

  text.legend {
    font: 14px sans-serif;
    fill: #333;
    pointer-events: none;
    user-select: none;
  }


`;

export default Wrapper;
