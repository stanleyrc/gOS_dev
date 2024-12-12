import { useGPT } from './useGPT';

const FILTER_SYSTEM_PROMPT = {
  role: 'system',
  content: `You are a danfojs DataFrame filter generator. Given column names and a natural language
description,
  generate a valid JSON filter mask object. The mask should have a 'rows' property containing a
boolean
  expression that can be evaluated by DanfoJS. Example output format:
  {
    "rows": "df['column'].gt(5).and(df['other_column'].eq('value'))"
  }

  Return only valid JSON containing the filter expression. Do not encapulate the expression in triple backticks (e.g \`\`\`json\`\`\`), just give the raw JSON object.
`
};

export const useGenerateDataFrameFilter = () => {
  const { queryGPT } = useGPT();

  const generateFilter = async (columns, filterDescription) => {
    try {
      const prompt = `Given these DataFrame columns: ${columns.join(', ')}\n
      Generate a filter mask for this request: "${filterDescription}"\n
      Return only valid JSON containing the filter expression.`;

      const response = await queryGPT(prompt, {
        systemMessage: FILTER_SYSTEM_PROMPT,
        model: 'smart'
      });

      // Parse the response into a JSON object
      const filterMask = JSON.parse(response);

      // Validate the response has the required structure
      if (!filterMask.rows) {
        throw new Error('Invalid filter mask generated: missing rows property');
      }

      
      return filterMask
    } catch (error) {
      console.error('Error generating DataFrame filter:', error);
      throw error;
    }
  };

  return {
    generateFilter
  };
};
