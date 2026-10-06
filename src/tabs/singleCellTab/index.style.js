import styled from "styled-components";

const Wrapper = styled.div`
  padding: 0 0 24px;

  .sc-tab-loading {
    width: 100%;
    padding: 48px 0;
  }
  /* The pinned navigation shrinks (compact) after antd fixes its box at the
     full height; let the box follow the content so it doesn't cover the
     heatmap controls below it. */
  .sc-nav-affix .ant-affix {
    height: auto !important;
  }
`;

export default Wrapper;
