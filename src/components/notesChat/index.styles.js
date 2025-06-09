import { createGlobalStyle } from 'styled-components';

export default createGlobalStyle`
  &.notes-chat-card {
    height: 450px; // Adjust as needed
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

    .ant-card-head {
      padding: 0 16px;
      min-height: 48px;
    }

    .ant-card-body {
      padding: 0;
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }

    .chat-list {
      flex-grow: 1;
      overflow-y: auto;
      padding: 16px;

      .message-item {
        margin-bottom: 12px;
        &.user {
          .ant-list-item-meta-content {
            align-items: flex-end;
          }
          .ant-list-item-meta-description {
            background-color: #e6f7ff;
            border-radius: 8px;
            padding: 8px 12px;
            display: inline-block;
          }
        }
        &.bot {
          .ant-list-item-meta-description {
            background-color: #f0f0f0;
            border-radius: 8px;
            padding: 8px 12px;
            display: inline-block;
          }
        }
      }
    }

    .chat-input {
      display: flex;
      padding: 16px;
      border-top: 1px solid #f0f0f0;

      .ant-input {
        margin-right: 8px;
      }
    }
  }
`;
