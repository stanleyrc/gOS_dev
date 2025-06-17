import styled from "styled-components";
import { List as AntList } from "antd";

export const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
`;

export const SearchSection = styled.div`
  background: #fff;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 24px;
`;

export const FiltersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-top: 16px;
`;

export const ResultsSection = styled.div`
  background: #fff;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

export const ResultsHeader = styled.div`
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
`;

export const List = styled(AntList)`
  .ant-list-item {
    padding: 24px;
    border: 1px solid #f0f0f0;
    border-radius: 4px;
    margin-bottom: 16px;
  }

  .ant-list-item-meta-title {
    font-size: 18px;
    margin-bottom: 8px;
    
    a {  // Add this to ensure link is always colored
      color: #1890ff;
      
      &:hover {
        color: #40a9ff;
      }
    }
  }

  .ant-list-item-meta-description {
    color: #666;
  }
`;

export const ViewLink = styled.a`
  color: #1890ff; // Standard Ant Design link color
  text-align: left;
  display: block;
  margin-left: 0; // Remove the previous margin
  
  &:hover {
    color: #40a9ff; // Ant Design hover color
  }
`;
