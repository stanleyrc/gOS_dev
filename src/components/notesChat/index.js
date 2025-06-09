import React, { useState } from 'react';
import { Card, Input, Button, List, Avatar } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useGPT } from '../../hooks/useGPT'; // Assuming this path is correct relative to the new file
import GlobalStyle from './index.styles.js';
import { withTranslation } from "react-i18next";

const NotesChat = ({ t, record, report }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { queryGPT } = useGPT();

  const getBotResponse = async (userMessage) => {
    setIsLoading(true);
    try {
      // Construct a context string if record and report are available
      let contextPrompt = "";
      if (record) {
        contextPrompt += `The user is asking about the following event: ${JSON.stringify(record)}. `;
      }
      if (report) {
        contextPrompt += `Additional context from the report: ${JSON.stringify(report)}. `;
      }

      const fullQuery = contextPrompt 
        ? `${contextPrompt}\n\nUser query: ${userMessage}`
        : userMessage;
      
      const response = await queryGPT(fullQuery, {
        model: 'smart' // Or 'default' or other appropriate model
      });
      return response;
    } catch (error) {
      console.error('Error getting bot response:', error);
      return t('components.notes-chat.gpt-error', "I'm sorry, I encountered an error processing your request.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (inputValue.trim()) {
      const userMessageContent = inputValue;
      // Add user message
      setMessages(prevMessages => [
        ...prevMessages,
        {
          type: 'user',
          content: userMessageContent,
          timestamp: new Date().getTime()
        }
      ]);
      
      setInputValue('');

      // Get bot response
      const response = await getBotResponse(userMessageContent);
      
      setMessages(prevMessages => [...prevMessages, {
        type: 'bot',
        content: response,
        timestamp: new Date().getTime()
      }]);
    }
  };

  return (
    <>
      <GlobalStyle />
      <Card 
        className="notes-chat-card"
        title={
          <div className="chat-header">
            <span>{t('components.notes-chat.title', "Chat about this event")}</span>
          </div>
        }
      >
        <List
          className="chat-list"
          itemLayout="horizontal"
          dataSource={messages}
          renderItem={message => (
            <List.Item className={`message-item ${message.type}`}>
              <List.Item.Meta
                avatar={
                  <Avatar>
                    {message.type === 'bot' ? '🐦' : '👤'}
                  </Avatar>
                }
                description={message.content}
              />
            </List.Item>
          )}
        />
        <div className="chat-input">
          <Input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onPressEnter={handleSend}
            placeholder={t('components.notes-chat.placeholder', "Type a message...")}
            disabled={isLoading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={isLoading}
          />
        </div>
      </Card>
    </>
  );
};

NotesChat.defaultProps = {
  record: null,
  report: null,
};

// No mapStateToProps or connect needed if props are passed down directly

export default withTranslation("common")(NotesChat);
