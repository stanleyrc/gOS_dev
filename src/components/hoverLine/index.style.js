import styled from "styled-components";

const Wrapper = styled.div`
  svg.plot-container {
    position: absolute;
    top: 0px;
    user-select: none;
    pointer-events: none;
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
`;

export default Wrapper;
