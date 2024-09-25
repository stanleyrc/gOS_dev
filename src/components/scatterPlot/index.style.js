import styled from "styled-components";

const Wrapper = styled.div`
  .ant-wrapper {
    background: white;
    padding: 0px;
    height: ${(props) => props.height}px !important;
  }
  div.scatterplot canvas {
    margin: ${(props) => props.margins.gapY}px
      ${(props) => props.margins.gapX}px !important;
    padding: 0px !important;
  }
  svg.plot-container {
    position: absolute;
    top: 0px;
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
  .y-axis-title {
    font-size: 10px;
    fill: #333;
  }
`;

export default Wrapper;
