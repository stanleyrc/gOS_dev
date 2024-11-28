import styled from "styled-components";

const Wrapper = styled.div`
  display: ${(props) => (props.visible ? "block" : "none")};
  .ant-wrapper {
    background: white;
    padding: 0px;
  }
`;

export default Wrapper;
