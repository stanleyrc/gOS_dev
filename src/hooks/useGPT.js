const API_URLS = {
  smart: '/api/gpt-4o/v1.0.0/chat/completions',
  cheap: '/api/gpt-4o-mini/v1.0.0/chat/completions'
};

// Default system message that can be overridden
const DEFAULT_SYSTEM_MESSAGE = {
  role: 'system',
  content: 'You are a helpful assistant.'
};

/**
 * Makes a request to the GPT API
 * @param {string} userMessage - The user's input message
 * @param {Object} options - Optional configuration
 * @param {string} options.systemMessage - Override default system message
 * @param {string} options.model - Model to use ('smart' or 'cheap')
 * @returns {Promise<string>} The AI response content
 */
export const queryGPT = async (userMessage, options = {}) => {
  const apiKey = process.env.REACT_APP_OPENAI_NYU_API_KEY;
  
  if (!apiKey) {
    throw new Error('GPT API key not found in environment variables');
  }

  // Default to 'smart' if no model specified
  const model = options.model || 'smart';
  const API_URL = API_URLS[model];

  if (!API_URL) {
    throw new Error('Invalid model specified. Use "smart" or "cheap".');
  }

  // options.messages can be an array of message objects to use directly
  const messages = options.messages || [
    options.systemMessage || DEFAULT_SYSTEM_MESSAGE,
    { role: 'user', content: userMessage }
  ];

  const payload = {
    messages,
    ...(options.tools && { tools: options.tools }),
    ...(options.tool_choice && { tool_choice: options.tool_choice }),
    // Ensure model is included if passed in options, otherwise it's handled by API_URL selection
    ...(options.modelPayload && { model: options.modelPayload }) 
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data?.choices[0]?.message; // Return the entire message object
    
  } catch (error) {
    console.error('Error querying GPT:', error);
    throw error;
  }
};

// React hook for using GPT
export const useGPT = () => {
  return {
    queryGPT
  };
};
