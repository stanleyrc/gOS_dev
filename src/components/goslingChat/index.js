import React, { useState, useEffect } from 'react';
import { Card, Input, Button, List, Avatar } from 'antd';
import { SendOutlined, CloseOutlined } from '@ant-design/icons';
import { connect } from "react-redux";
import * as dfd from "danfojs";
import GlobalStyle from './index.styles.js';
import axios from "axios";
import { transformFilteredEventAttributes } from "../../helpers/utility";

const GoslingChat = ({ onClose, reports, dataset }) => {
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

  const handleSend = () => {
    if (inputValue.trim()) {
      setMessages([
        ...messages,
        {
          type: 'user',
          content: inputValue,
          timestamp: new Date().getTime()
        }
      ]);
      setInputValue('');
      // Here you would typically make an API call to get the chatbot response
      // For now, we'll just add a mock response
      setTimeout(() => {
        setMessages(prev => [...prev, {
          type: 'bot',
          content: "I'm Gosling, how can I help you?",
          timestamp: new Date().getTime()
        }]);
      }, 1000);
    }
  };

  return (
    <>
      <GlobalStyle />
    <Card 
      className="gosling-chat-card"
      title={
        <div className="chat-header">
          <span>Gosling Chat</span>
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
};

const mapStateToProps = (state) => ({
  reports: state.CaseReports.reports,
  dataset: state.Settings.dataset,
});

export default connect(mapStateToProps)(GoslingChat);
