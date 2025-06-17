const API_URLS = {
  smart: "/api/gpt-4o/v1.0.0/chat/completions",
  cheap: "/api/gpt-4o-mini/v1.0.0/chat/completions",
};

// Default system message that can be overridden
const DEFAULT_SYSTEM_MESSAGE = {
  role: "system",
  content: "You are a helpful assistant.",
};

const OPENAI_RATE_LIMIT_DELAY = 2000; // 2 seconds delay to avoid rate limiting

/**
 * Makes a request to the GPT API
 * @param {string} userMessage - The user's input message
 * @param {Object} options - Optional configuration
 * @param {string} options.systemMessage - Override default system message
 * @param {string} options.model - Model to use ('smart' or 'cheap')
 * @returns {Promise<string>} The AI response content
 */
export const queryGPT = async (userMessage, options = {}) => {
  // Construct the full URL
  const settingsURL = `settings.json`;

  const settingsURLResponse = await fetch(settingsURL);
  if (!settingsURLResponse.ok) {
    throw new Error(
      `HTTP error! Settings fetching failed with status: ${settingsURLResponse.status}`
    );
  }
  const settings = await settingsURLResponse.json();

  let apiKey = process.env.REACT_APP_OPENAI_NYU_API_KEY || settings.gptKey;
  if (!apiKey) {
    throw new Error(
      "GPT API key not found in environment variables or in the gptKey variable in settings.json"
    );
  }

  // Default to 'smart' if no model specified
  const model = options.model || "smart";
  const API_URL = API_URLS[model];

  if (!API_URL) {
    throw new Error('Invalid model specified. Use "smart" or "cheap".');
  }

  // options.messages can be an array of message objects to use directly
  const messages = options.messages || [
    options.systemMessage || DEFAULT_SYSTEM_MESSAGE,
    { role: "user", content: userMessage },
  ];

  const payload = {
    messages,
    ...(options.tools && { tools: options.tools }),
    ...(options.tool_choice && { tool_choice: options.tool_choice }),
    // Ensure model is included if passed in options, otherwise it's handled by API_URL selection
    ...(options.modelPayload && { model: options.modelPayload }),
  };

  try {
    // add a 2 second delay to avoid rate limiting
    await new Promise((resolve) =>
      setTimeout(resolve, OPENAI_RATE_LIMIT_DELAY || 2000)
    );

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `HTTP error! ${API_URL} call failed with status: ${response}`
      );
    }

    const data = await response.json();
    return data?.choices[0]?.message; // Return the entire message object
  } catch (error) {
    console.error("Error querying GPT:", error);
    throw error;
  }
};

// React hook for using GPT
export const useGPT = () => {
  return {
    queryGPT,
  };
};
