import { useGPT } from './useGPT';

const ROUTER_SYSTEM_PROMPT = {
  role: 'system',
  content: `You are a tool routing assistant. Your job is to determine which tool is most appropriate 
  for handling user queries about data analysis and general questions. Choose the most appropriate 
  function based on the query content.`
};

const tools = [
  { 
    name: "queryGPT",
    description: "For general questions or conversation"
  },
  { 
    name: "generateFilter" ,
    description: "For filtering cases/patients given some critieria."
  }
];

export const useGPTToolRouter = () => {
  const { queryGPT } = useGPT();

  const routeQuery = async (query) => {
    try {
      const prompt = `Given this user query: "${query}"
      Determine which of the following function would be most appropriate to handle this request based on its description:
      ${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

      Return only the tool.name in your response.
      `;

      const response = await queryGPT(prompt, {
        systemMessage: ROUTER_SYSTEM_PROMPT,
        model: 'smart',
      });

      const toolName = response.trim().includes('queryGPT') ? 'queryGPT' : 'generateFilter';

      return toolName;

    } catch (error) {
      console.error('Error in GPT tool routing:', error);
      throw error;
    }
  };

  return {
    routeQuery
  };
};
