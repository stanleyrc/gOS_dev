import styled from "styled-components";

const Wrapper = styled.div`
  padding: 0 0 24px;

  .sc-tab-loading {
    width: 100%;
    padding: 48px 0;
  }
  .sc-group-box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid #f0f0f0;
  }
  .sc-group-a {
    background: #fff0f6;
    border-color: #ffadd2;
  }
  .sc-group-b {
    background: #f0f5ff;
    border-color: #adc6ff;
  }
  .sc-row-active td {
    background: #fff7e6 !important;
  }
  .sc-picked {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    padding: 8px 12px;
    border: 1px dashed #d9d9d9;
    border-radius: 6px;
  }
`;

export default Wrapper;
