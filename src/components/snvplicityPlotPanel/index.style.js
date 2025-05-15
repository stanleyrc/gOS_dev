import styled from "styled-components";

const Wrapper = styled.div`
  .ant-wrapper {
    background: white;
    padding: 0px;
    min-height: 400px;
    width: 100%;
  }
  .ant-card-body {
    display: ${(props) => (props.visible ? "block" : "none")};
  }
  .gutter-row {
    padding: 8px 0;
  }
`;

export default Wrapper;
