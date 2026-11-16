import styled from "styled-components";

const Wrapper = styled.div`
  .ant-wrapper {
    background: white;
    padding: 0px;
    height: 280px;
  }
  /* pinned (compact) strip: tight card padding */
  .tracks-legend-compact.ant-card-small > .ant-card-body {
    padding: 4px 12px;
  }
  /* single-cell genome header: no inline-svg baseline gap under the strip, gene track or ideogram */
  .tracks-legend-tight .ant-wrapper svg.legend-container,
  .tracks-legend-tight .ant-wrapper svg.plot-container-cytobands {
    display: block;
  }
  .tracks-legend-tight.ant-card-small > .ant-card-body {
    padding-bottom: 4px !important;
  }
  .ant-wrapper-legend {
    background: white;
    padding: 0px;
    .brush-container .selection {
      stroke: #ff7f0e;
      stroke-width: 1.3;
      fill-opacity: 0.125;
      shape-rendering: crispEdges;
    }
    text {
      user-select: none;
    }
    .brush .selection {
      stroke: steelblue;
      fill-opacity: 0.125;
      shape-rendering: crispEdges;
    }
    .highlighted .selection {
      stroke: orange;
      stroke-width: 2;
    }
  }
  .ant-card-extra {
    font-size: 14px !important;
  }
  .ant-card-body {
    padding-top: 4px !important;
    padding-bottom: 2px !important;
  }
  .gene-records-text {
    width: 200px;
  }
  .location-input {
    width: 500px;
  }
`;

export default Wrapper;
