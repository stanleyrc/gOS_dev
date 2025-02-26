import styled from "styled-components";

const Wrapper = styled.div`
  .ant-wrapper-genes {
    background: transparent;
    padding: 0px;
    min-height: 70px;
  }
  svg.plot-container-genes {
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
    fill: #ff7f0e !important;
  }
  .rect-highlighted {
    font-weight: bold;
    fill: #ff7f0e !important;
    stroke: #b3590a !important;
  }
`;

export default Wrapper;
