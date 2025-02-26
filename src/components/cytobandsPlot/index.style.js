import styled from "styled-components";

const Wrapper = styled.div`
  .ant-wrapper-cytobands {
    background: transparent;
    padding: 0px;
    min-height: 70px;
  }
  svg.plot-container-cytobands {
    position: relative;
    user-select: none;
  }
  line.hovered-location-line {
    stroke: rgb(255, 127, 14);
    stroke-width: 1.33px;
    stroke-dasharray: 5, 5;
  }
  text.hovered-location-text {
    fill: rgb(255, 127, 14);
    font-size: 10px;
    user-select: none;
  }
  .highlighted {
    font-weight: bold;
    fill: #b3590a !important;
  }
  .rect-highlighted {
    font-weight: bold;
    stroke: #b3590a !important;
    stroke-width: 3px;
  }
  .tooltip {
    pointer-events: none;
    user-select: none;
  }
  .cytoband text {
    user-select: none;
    pointer-events: none;
  }
`;

export default Wrapper;
