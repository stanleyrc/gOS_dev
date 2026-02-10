import styled from "styled-components";

const Wrapper = styled.div`
  position: relative;

  .ant-wrapper {
    background: white;
    padding: 0px;
    height: ${(props) => props.height}px !important;
  }

  div.mutations-webgl canvas {
    margin: ${(props) => props.margins.gap}px
      ${(props) => props.margins.gapX}px !important;
    padding: 0px !important;
  }

  svg.plot-container {
    position: absolute;
    top: 0px;
    left: 0px;
    user-select: none;
    pointer-events: none;
  }

  /* Re-enable pointer events on zoom rects */
  svg.plot-container rect.zoom-background {
    pointer-events: all;
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
