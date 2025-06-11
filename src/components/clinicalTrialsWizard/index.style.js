import styled from "styled-components";
import { List as AntList, Space, Form } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

export const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  
  .ant-btn {
    font-size: 14px;
    height: 32px;
    padding: 4px 15px;
    border-radius: 4px;
    
    &:hover {
      background-color: #fafafa;
    }
  }

  // Add these specific styles for the search button
  .ant-btn-primary {
    color: white;
    background-color: #1890ff;
    
    &:hover {
      color: white;
      background-color: #40a9ff;
    }
  }

  margin-top: 16px;
  padding: 16px;
  background-color: #f5f5f5;
  border-radius: 4px;

  h4 {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 12px;
    color: #262626;
  }

  ul {
    list-style-type: disc;
    padding-left: 20px;
    margin-bottom: 16px;
  }

  li {
    margin-bottom: 8px;
    line-height: 1.5;
    color: #595959;
  }
`;

export const SelectAllContainer = styled(Space)`
  margin-bottom: 8px;
`;

export const SearchButton = styled(Form.Item)`
  grid-column: 1 / -1;
  margin-top: 24px;
`;

export const TitleContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const AddIcon = styled(PlusOutlined)`
  cursor: pointer;
  font-size: 16px;
  color: #1890ff;
`;

export const EligibilityCriteria = styled.div`
  margin-top: 10px;
  padding: 10px;
  background-color: #f5f5f5;
  border-radius: 4px;
`;

export const ShowMoreButton = styled.div`
  margin-top: 10px;
`;

export const PaginationContainer = styled.div`
  margin-top: 20px;
  text-align: center;
  display: flex;
  justify-content: center;
  gap: 8px;
`;

export const PageInfo = styled.span`
  margin: 0 16px;
`;

export const ResultsSection = styled.div`
  background: #fff;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-top: 24px;
`;

export const ResultsHeader = styled.div`
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
`;

export const StyledList = styled(AntList)`
  .ant-list-item {
    padding: 24px;
    border: 1px solid #f0f0f0;
    border-radius: 4px;
    margin-bottom: 16px;
  }

  .ant-list-item-meta-title {
    font-size: 18px;
    margin-bottom: 8px;
    
    a {
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
  color: #1890ff;
  text-align: left;
  display: block;
  margin-left: 0;
  
  &:hover {
    color: #40a9ff;
  }
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

export const CheckboxGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
`;

export const EligibilityCheckButtonContainer = styled.div`
  margin-left: 8px;
  display: inline-block; 
  vertical-align: middle; // Helps align with other inline-block elements like buttons

  .ant-btn { // Specific styling for buttons within this container if needed
    margin-left: 0; // Override default button margins if any
  }
`;
