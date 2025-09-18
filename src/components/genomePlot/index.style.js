import styled from "styled-components";

const Wrapper = styled.div`
  .ant-wrapper {
    background: white;
    padding: 0px;
    min-height: 400px;
  }
  .shape.highlighted {
    stroke: #ff7f0e !important;
    stroke-width: 1.5 !important;
  }
  path.connection.highlighted {
    stroke-width: 3 !important;
    opacity: 1;
  }
  path.non-protein-coded {
    opacity: 0.5;
  }
  .phylogeny-annotated {
    fill-opacity: 0.33;
    stroke: #79b321 !important;
    stroke-width: 2 !important;
    opacity: 1 !important;
  }
  .annotated {
    fill-opacity: 0.33;
    stroke: #a020f0 !important;
    stroke-width: 2 !important;
    opacity: 1 !important;
  }
  .cross-annotated {
    stroke: url(#crossgrad) !important;
    stroke-width: 4 !important;
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
  text.label-magnitude {
    user-select: none;
  }
  g.tick text {
    user-select: none;
  }
  .y-axis-title {
    font-size: 10px;
    fill: #333;
  }
`;

export default Wrapper;
