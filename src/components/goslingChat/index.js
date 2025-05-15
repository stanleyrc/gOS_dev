import React, { useState, useEffect } from 'react';
import { Card, Input, Button, List, Avatar } from 'antd';
import { SendOutlined, CloseOutlined } from '@ant-design/icons';
import { connect } from "react-redux";
import * as dfd from "danfojs";
import { useGPTToolRouter } from '../../hooks/useGPTToolRouter';
import { useGenerateDataFrameFilter } from '../../hooks/useGenerateDataFrameFilter';
import { useGPT } from '../../hooks/useGPT';
import GlobalStyle from './index.styles.js';
import axios from "axios";
import { transformFilteredEventAttributes } from "../../helpers/utility";
import { filterDataFrame } from '../../helpers/gosling';

const GoslingChat = ({ onClose, reports, dataset, onSearch }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [allFilteredEvents, setAllFilteredEvents] = useState([]);
  const [eventsDF, setEventsDF] = useState(null);

  useEffect(() => {
    // Log all filtered events when component mounts or filteredEvents changes
    const fetchAllFilteredEvents = async () => {
      try {
        // Get all case IDs from reports
        const caseIds = reports.map(r => r.pair);
        
        // Fetch filtered events for each case
        const allEventsPromises = caseIds.map(async (caseId) => {
          const response = await axios.get(
            `${dataset.dataPath}${caseId}/filtered.events.json`
          );
          
          // Transform the events and add case ID
          const events = transformFilteredEventAttributes( response.data || [] )
          
          return events;
        });

        // Wait for all requests to complete
        const results = await Promise.all(allEventsPromises);
        
        // Merge all events into a single array
        const mergedEvents = results.flat();
        
        setAllFilteredEvents(mergedEvents);

        // Create DataFrame from merged events
        const df = new dfd.DataFrame(mergedEvents);
        setEventsDF(df);

        // Example of filtering fusions
        // const fusionMask = df['type'].eq('fusion');
        // const fusions = df.loc({ rows: fusionMask });
        // console.log('fusions', fusions);
        // console.log("Fusion events:");
        // fusions.print();

      } catch (error) {
        console.error("Error fetching filtered events:", error);
      }
    };

    fetchAllFilteredEvents();
  }, [reports, dataset]);

  const { routeQuery } = useGPTToolRouter();
  const { queryGPT } = useGPT();
  const { generateFilter } = useGenerateDataFrameFilter();

  const getBotResponse = async (userMessage) => {
    try {
      // Get available columns from the DataFrame
      const columns = eventsDF ? eventsDF.columns : [];
      
      // Route the query to appropriate tool
      const toolName = await routeQuery(userMessage);
      
      let response;
      if (toolName === 'generateFilter') {
        const filterMask = await generateFilter(
          columns,
          userMessage
        );
        
        // Apply the filter to the DataFrame
        const filteredCaseIds = filterDataFrame(eventsDF, filterMask);

        // Update the search filters to show only the filtered cases
        onSearch({
          pair: filteredCaseIds, // Add filtered cases to search filters
          page: 1,              // Reset to first page
          per_page: 10,         // Keep default page size
          orderId: 1            // Keep default ordering
        });
        
        response = `I've filtered the view to show these cases: ${filteredCaseIds.join(', ')}`;
        
      } else {
        // Handle general conversation
        response = await queryGPT(userMessage, {
          model: 'smart'
        });
      }
      
      return response;
      
    } catch (error) {
      console.error('Error getting bot response:', error);
      return "I'm sorry, I encountered an error processing your request.";
    }
  };

  const handleSend = async () => {
    if (inputValue.trim()) {
      // Add user message
      setMessages([
        ...messages,
        {
          type: 'user',
          content: inputValue,
          timestamp: new Date().getTime()
        }
      ]);
      
      const userMessage = inputValue;
      setInputValue('');

      // Get bot response
      const response = await getBotResponse(userMessage);
      
      setMessages(prev => [...prev, {
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
      className="gosling-chat-card"
      title={
        <div className="chat-header">
          <span>Chat with gOShawk</span>
          <CloseOutlined className="close-button" onClick={onClose} />
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
          placeholder="Type a message..."
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
        />
      </div>
    </Card>
    </>
  );
};

GoslingChat.defaultProps = {
  onClose: () => {},
  onSearch: () => {},  // Add default prop
};

const mapStateToProps = (state) => ({
  reports: state.CaseReports.reports,
  dataset: state.Settings.dataset,
});

export default connect(mapStateToProps)(GoslingChat);
