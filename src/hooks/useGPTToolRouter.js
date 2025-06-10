import { useGPT } from './useGPT';

const TOOL_ROUTING_SYSTEM_MESSAGE = {
  role: 'system',
  content: `You are a highly intelligent assistant responsible for routing user queries to the appropriate tool.
Based on the user's query, you must choose one of the available tools to best handle the request.
You must call one of the provided functions. Do not answer directly without selecting a tool.

Use the updateNotes tool when the user asks to modify, add to, or change the notes text.
Use the rankPapersByRelevance tool when the user asks to analyze research papers against a clinical context and identify relevant PMIDs.

`
};

const OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "generateFilter",
      description: "For filtering cases/patients given some criteria. Use this tool when the user asks to find, filter, or select patients/cases based on specific attributes (e.g., 'find patients with gene X mutation', 'show cases with Y characteristic').",
      parameters: {
        type: "object",
        properties: {
          criteria: {
            type: "string",
            description: "The filtering criteria derived from the user's query."
          }
        },
        required: ["criteria"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "rankPapersByRelevance",
      description: "Analyzes a list of research papers against a given clinical context and identifies the PMIDs of the papers most relevant to that context. The user is a clinician investigating a cancer patient. Returns an array of PMIDs.",
      parameters: {
        type: "object",
        properties: {
          recommendedPmids: {
            type: "array",
            description: "An array of PMIDs (PubMed Unique Identifiers) for the papers identified as most relevant to the clinical context, ordered by relevance if possible.",
            items: {
              type: "number",
              description: "A PubMed Unique Identifier (PMID)."
            }
          }
        },
        required: ["recommendedPmids"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "updateNotes",
      description: "Updates the existing notes content based on user instructions. Use this when the user asks to modify, add to, or generate the notes text.",
      parameters: {
        type: "object",
        properties: {
          userRequest: {
            type: "string",
            description: "The user's specific instruction on how to update the notes."
          },
          currentNotes: {
            type: "string",
            description: "The full current content of the notes area that needs to be updated."
          }
        },
        required: ["userRequest", "currentNotes"]
      }
    }
  }
];

// Export tools for use in other components that might call specific tools
export { OPENAI_TOOLS };

export const useGPTToolRouter = () => {
  const { queryGPT } = useGPT();

  const routeQuery = async (userQuery) => {
    try {
      const message = await queryGPT(userQuery, { // Pass userQuery directly
        systemMessage: TOOL_ROUTING_SYSTEM_MESSAGE,
        tools: OPENAI_TOOLS,
        // tool_choice: 'auto',
        model: 'smart',
      });

      if (message && message.tool_calls && message.tool_calls.length > 0) {
        return message.tool_calls;
      } else {
        console.warn('GPT tool router did not receive specific tool_calls, defaulting to queryGPT.\n\nResponse content:', message?.content);
        return
      }

    } catch (error) {
      console.error('Error in GPT tool routing:', error);
      throw error;
    }
  };

  return {
    routeQuery
  };
};
