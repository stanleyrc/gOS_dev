import styled from "styled-components";

const Wrapper = styled.div`
  display: ${(props) => (props.visible ? "block" : "none")};
  
  #igv-div {
    width: 100%;
    margin: 0 auto;
  }
`;

export default Wrapper;
