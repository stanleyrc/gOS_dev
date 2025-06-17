import { useGPT } from './useGPT';

const CHAR_LIMIT = 50000;
const SYSTEM_PROMPT = {
  role: 'system',
  content: `You are an academic research assistant specialized in summarizing scientific papers.
Focus on extracting and presenting:
- Main research questions/objectives
- Key methodology
- Principal findings
- Significant conclusions
Maintain academic tone and precision while being concise.`
};

/**
 * Truncates text to a specified length while trying to preserve complete sentences
 * @param {string} text - The text to truncate
 * @param {number} limit - Character limit
 * @returns {string} Truncated text
 */
const truncateText = (text, limit) => {
  if (text.length <= limit) return text;
  
  // Find the last period before the limit
  const truncated = text.substring(0, limit);
  const lastPeriod = truncated.lastIndexOf('.');
  
  return lastPeriod > 0 ? text.substring(0, lastPeriod + 1) : truncated;
};

/**
 * Hook for summarizing academic papers using GPT
 * @returns {Function} Function to summarize paper text
 */
export const usePaperSummarizer = () => {
  const { queryGPT } = useGPT();

  /**
   * Summarizes the given paper text
   * @param {string} paperText - The full text of the academic paper
   * @returns {Promise<string>} Summary of the paper
   */
  const summarizePaper = async (paperText) => {
    if (!paperText) {
      throw new Error('Paper text is required');
    }

    const truncatedText = truncateText(paperText, CHAR_LIMIT);
    
    const userPrompt = `Please summarize the following academic paper:\n\n${truncatedText}`;
    
    try {
      const summary = await queryGPT(userPrompt, { 
        systemMessage: SYSTEM_PROMPT,
        model: 'cheap' // use cheap model for full text summary
      });
      return summary.content;
    } catch (error) {
      console.error('Error summarizing paper:', error);
      throw error;
    }
  };

  return { summarizePaper };
};
