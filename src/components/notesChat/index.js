import React, { useState, useEffect } from 'react';
import { Card, Input, Button, List, Avatar, Collapse, Checkbox, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useGPT } from '../../hooks/useGPT'; // Assuming this path is correct relative to the new file
import GlobalStyle from './index.styles.js';
import { withTranslation } from "react-i18next";

const { Panel } = Collapse;
const { Text } = Typography;

const NotesChat = ({ t, record, report, memoryItems = [], onToggleMemoryItemSelection, onClearChatMemory }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { queryGPT } = useGPT();

  const getBotResponse = async (userMessage) => {
    setIsLoading(true);
    try {
      let contextPrompt = "";

      // Add selected memory items to context
      const activeMemoryItems = memoryItems.filter(item => item.selectedForContext);
      if (activeMemoryItems.length > 0) {
        contextPrompt += "The user has provided the following items as context for this query. Please prioritize information from these items when relevant:\n\n";
        activeMemoryItems.forEach(item => {
          contextPrompt += `[Context Item: ${item.title} (Type: ${item.type})]\nContent:\n${JSON.stringify(item.data, null, 2)}\n---\n`;
        });
        contextPrompt += "\n";
      }
      
      const fullQuery = `${contextPrompt}User query: ${userMessage}`;
      
      const gptResponse = await queryGPT(fullQuery, { // queryGPT returns a message object
        model: 'smart' 
      });
      return gptResponse?.content; // Extract content from the message object
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
      <Collapse style={{ marginBottom: '16px' }}>
        <Panel header={t('components.notes-chat.memory-context-title', "Memory Context")} key="1">
          {memoryItems.length === 0 ? (
            <Text type="secondary">{t('components.notes-chat.no-memory-items', "No items in memory. Add papers or clinical trials using the wizards below.")}</Text>
          ) : (
            <List
              size="small"
              dataSource={memoryItems}
              renderItem={item => (
                <List.Item>
                  <Checkbox
                    checked={item.selectedForContext}
                    onChange={() => onToggleMemoryItemSelection(item.id)}
                  >
                    {item.title} (<Text type="secondary" style={{fontSize: '0.8em'}}>{item.type}</Text>)
                  </Checkbox>
                </List.Item>
              )}
            />
          )}
          {memoryItems.filter(item => item.type === 'paper' || item.type === 'clinicalTrial').length > 0 && onClearChatMemory && (
             <Button 
                onClick={onClearChatMemory} 
                size="small" 
                style={{marginTop: '10px'}}
                danger
              >
                {t('components.notes-chat.clear-chat-memory', "Clear Added Papers/Trials from Memory")}
              </Button>
          )}
        </Panel>
      </Collapse>
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
  memoryItems: [],
  onToggleMemoryItemSelection: () => {},
  onClearChatMemory: null,
};

// No mapStateToProps or connect needed if props are passed down directly

export default withTranslation("common")(NotesChat);
