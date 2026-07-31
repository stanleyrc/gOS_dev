import styled from "styled-components";

const PreviewLayout = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const ReportToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
`;

const PreviewContainer = styled.div`
  flex: 1;
  min-height: 0;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 24px;
`;

const PreviewIframe = styled.iframe`
  width: 100%;
  height: 100%;
  border: none;
`;

export {
  LoadingContainer,
  PreviewContainer,
  PreviewIframe,
  PreviewLayout,
  ReportToolbar,
};
