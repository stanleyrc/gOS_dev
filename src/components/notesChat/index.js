import React, { useState, useEffect } from 'react';
import { Card, Input, Button, List, Avatar, Collapse, Checkbox, Typography, message as antdMessage } from 'antd'; // Added message
import { SendOutlined, ClearOutlined } from '@ant-design/icons'; // Added ClearOutlined
import ReactMarkdown from 'react-markdown';
import { useGPT } from '../../hooks/useGPT'; // Assuming this path is correct relative to the new file
import { useGPTToolRouter } from '../../hooks/useGPTToolRouter'; // Import the tool router
import GlobalStyle from './index.styles.js';
import { withTranslation } from "react-i18next";

const { Panel } = Collapse;
const { Text, Paragraph } = Typography;

const NotesChat = ({ 
  t, 
  record, 
  report, 
  memoryItems = [], 
  onToggleMemoryItemSelection, 
  onClearChatMemory, 
  onExecuteToolCall, 
  onChatHistoryCleared, 
  forceUpdateNotesTool,
  totalSelectedTokens = 0, // Ensure default value
  maxContextTokens = 30000, // Ensure default value
  isTokenLimitExceeded = false // Ensure default value
}) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { queryGPT } = useGPT();
  const { routeQuery } = useGPTToolRouter(); // Instantiate the tool router

  const getBotResponse = async (userMessage) => {
    // setIsLoading(true); // isLoading is now managed by handleSend
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
      // setIsLoading(false); // isLoading is now managed by handleSend
    }
  };

  const handleSend = async () => {
    if (inputValue.trim()) {
      const userMessageContent = inputValue;
      setMessages(prevMessages => [
        ...prevMessages,
        {
          type: 'user',
          content: userMessageContent,
          timestamp: new Date().getTime()
        }
      ]);
      setInputValue('');
      setIsLoading(true);

      try {
        const routeQueryOptions = {};
        if (forceUpdateNotesTool) {
          routeQueryOptions.tool_choice = { type: "function", function: { name: "updateNotes" } };
        }

        const toolCalls = await routeQuery(userMessageContent, routeQueryOptions);

        if (toolCalls && toolCalls.length > 0) {
          const mainToolCall = toolCalls[0];
          const toolName = mainToolCall.function.name;

          if (toolName === 'updateNotes') {
            setMessages(prev => [...prev, { type: 'bot', content: t('components.notes-chat.processing-update', "Processing your notes update request..."), timestamp: new Date().getTime() }]);
            // Pass the current messages state to onExecuteToolCall
            await onExecuteToolCall(mainToolCall, messages); 
            // Final feedback (success/error) for updateNotes is handled by NotesModal via Antd messages
            setMessages(prev => [...prev, { type: 'bot', content: t('components.notes-chat.processing-update', "Notes updated!"), timestamp: new Date().getTime() }]);
          } else { // Default to chat response for 'queryGPT' or other tools not specifically handled otherwise
            const queryForBot = toolName === 'queryGPT' && mainToolCall.function.arguments
              ? (JSON.parse(mainToolCall.function.arguments).query || userMessageContent)
              : userMessageContent;
            const botResponseText = await getBotResponse(queryForBot);
            setMessages(prev => [...prev, { type: 'bot', content: botResponseText, timestamp: new Date().getTime() }]);
          }
        } else {
          // Fallback: Router didn't provide a tool call, or an error occurred in routing that was caught by router
          const botResponseText = await getBotResponse(userMessageContent);
          setMessages(prev => [...prev, { type: 'bot', content: botResponseText, timestamp: new Date().getTime() }]);
        }
      } catch (error) {
        console.error('Error in handleSend:', error);
        setMessages(prev => [...prev, { type: 'bot', content: t('components.notes-chat.handle-send-error', "An error occurred while processing your message."), timestamp: new Date().getTime() }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    if (onChatHistoryCleared) {
      onChatHistoryCleared();
    }
    antdMessage.success(t('components.notes-chat.chat-cleared-success', "Chat history cleared."));
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
                    <Text type="secondary" style={{fontSize: '0.8em', marginLeft: '8px'}}>
                      ({item.tokenCount || 0} {t('components.notes-chat.tokens', 'tokens')})
                    </Text>
                  </Checkbox>
                </List.Item>
              )}
            />
          )}
          <div style={{ marginTop: '10px', marginBottom: '10px' }}>
            <Text>
              {t('components.notes-chat.total-tokens', 'Total Selected Tokens')}: {totalSelectedTokens || 0} / {maxContextTokens || 0}
            </Text>
            {isTokenLimitExceeded && (
              <Paragraph type="danger" style={{ marginTop: '5px', marginBottom: '0px' }}>
                {t('components.notes-chat.token-limit-exceeded-warning', 'Warning: Token limit exceeded. Please deselect items to enable chat.')}
              </Paragraph>
            )}
          </div>
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
          <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{t('components.notes-chat.title', "Chat about this event")}</span>
            <Button
              icon={<ClearOutlined />}
              onClick={handleClearChat}
              size="small"
              title={t('components.notes-chat.clear-chat-button', "Clear Chat")}
            >
              {t('components.notes-chat.clear-chat-button-label', "Clear")}
            </Button>
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
                description={
                  message.type === 'bot' ? (
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  ) : (
                    message.content
                  )
                }
              />
            </List.Item>
          )}
        />
        <div className="chat-input">
          <Input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onPressEnter={!isTokenLimitExceeded && !isLoading ? handleSend : undefined}
            placeholder={t('components.notes-chat.placeholder', "Type a message...")}
            disabled={isLoading || isTokenLimitExceeded}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={isLoading}
            disabled={isLoading || isTokenLimitExceeded}
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
  onExecuteToolCall: () => {},
  onChatHistoryCleared: () => {}, 
  forceUpdateNotesTool: false, 
  totalSelectedTokens: 0, // Default prop
  maxContextTokens: 60000, // Default prop
  isTokenLimitExceeded: false, // Default prop
};

// No mapStateToProps or connect needed if props are passed down directly
// PropTypes would be good to add for onExecuteToolCall: PropTypes.func,
// but sticking to existing conventions of the file.

export default withTranslation("common")(NotesChat);
