import { createGlobalStyle } from 'styled-components';

export default createGlobalStyle`
  .gosling-chat-card {
    width: 300px;
    height: 400px;
    position: fixed;
    right: 24px;
    bottom: 100px;
    z-index: 99;
    display: flex;
    flex-direction: column;

    .ant-card-head {
      min-height: 40px;
      padding: 0 12px;
      
      .ant-card-head-title {
        padding: 8px 0;
        width: 90%;
        width: 90%;
      }
    }

    .chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .close-button {
        cursor: pointer;
        &:hover {
          color: #1890ff;
        }
      }
    }

    .ant-card-body {
      height: 100%;
      padding: 12px;
      display: flex;
      flex-direction: column;
    }
  }

  .message-item {
    margin: 8px 0;
    padding: 0 12px;
    width: 100%;
    display: flex !important;
    
    &.user {
      flex-direction: row-reverse;
      
      .ant-list-item-meta {
        flex: 1;
        padding-left: 0;
        padding-right: 12px;
      }

      .ant-list-item-meta-content {
        margin-left: auto;
        background-color: #1890ff;
        color: white;
      }
    }

    &.bot {
      .ant-list-item-meta {
        flex: 1;
      }

      .ant-list-item-meta-content {
        background-color: #f0f0f0;
        margin-right: auto;
      }
    }

    .ant-list-item-meta {
      margin-bottom: 0;
    }
  }

  .chat-list {
    flex: 1;
    overflow-y: auto;
    width: 100%;
  }

  .chat-input {
    display: flex;
    gap: 8px;
    padding: 12px;
    margin-top: auto;

    .ant-input {
      flex: 1;
    }
  }

  .ant-list-item-meta-content {
    display: inline-block;
    padding: 8px 12px;
    border-radius: 12px;
    width: 90%;
  }
`;
