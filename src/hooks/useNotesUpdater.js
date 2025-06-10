import { useGPT } from './useGPT';
import { usePaperSummarizer } from '../hooks/usePaperSummarizer'; // Import for summarizing papers
import { formatClinicalTrials } from '../helpers/notes'; // Import for formatting trials

const SYSTEM_PROMPT_UPDATE_NOTES = `You are an intelligent text editing assistant. The user will provide their current notes and a request to modify them. You must incorporate the user's request into the current notes and return the complete, new version of the notes. You may also be provided with additional context such as genomic event data, case metadata, research paper summaries, and clinical trial information; use this context if relevant to the user's request. Output *only* the revised notes as a single block of text. Do not add any conversational preamble or explanation.

The report should be in the style of FoundationOne CDx reports. 
Format your response in markdown with the following sections:

## [GENE NAME]
[Gene summary]

### Alteration
[Specific alteration details]

### Variant Allele Frequency (VAF)
[Frequency information]

## POTENTIAL TREATMENT STRATEGIES
### Targeted Therapies
[List relevant targeted therapies]

### Non-targeted Approaches
[List other treatment approaches]

## FREQUENCY & PROGNOSIS
[Frequency and prognosis information]

## REFERENCES
[List references which are directly cited in this report in APA format]

Base your analysis ONLY on the provided event data, research papers, clinical trials, and clinician notes. Do not include any additional information outside of the provided context.
Be precise and clinical in your language, similar to FoundationOne CDx reports.
Only use the headers provided above. Do not include any additional sections.
`;

/**
 * Formats input data for the notes update GPT processing
 */
function formatInputDataForUpdate(userRequest, currentNotes, record, metadata, paperSummaries, clinicalTrials) {
  // Extract only specified fields from record if available
  const relevantRecord = record ? {
    gene: record.gene,
    type: record.type,
    tier: record.tier,
    role: record.role,
    variant: record.variant,
    therapeutics: record.therapeutics,
    resistances: record.resistances,
    estimatedAlteredCopies: record.estimatedAlteredCopies,
    effect: record.effect,
    refCounts: record.refCounts,
    altCounts: record.altCounts,
    vaf: record.vaf,
    segmentCopyNumber: record.segmentCopyNumber,
    variant_summary: record.variant_summary,
    gene_summary: record.gene_summary,
    effect_description: record.effect_description,
    eventType: record.eventType
  } : null;

  // Extract only specified fields from metadata if available
  const relevantMetadata = metadata ? {
    pair: metadata.pair,
    tumor: metadata.tumor,
    disease: metadata.disease,
    primary_site: metadata.primary_site,
    sex: metadata.sex
  } : null;

  // Return formatted string with filtered data
  return `
USER REQUEST:
${userRequest}

CURRENT NOTES:
${currentNotes}

${relevantRecord ? `GENOMIC EVENT RECORD:\n${JSON.stringify(relevantRecord, null, 2)}\n` : ''}
${relevantMetadata ? `CASE METADATA:\n${JSON.stringify(relevantMetadata, null, 2)}\n` : ''}
RESEARCH PAPER SUMMARIES:
${Object.entries(paperSummaries)
  .map(([pmid, summary]) => `PMID:${pmid}\n${summary}`)
  .join('\n\n')}

RELEVANT CLINICAL TRIALS:
${Object.entries(clinicalTrials)
  .map(([nctid, trial]) => `NCTID:${nctid}\n${trial}`)
  .join('\n\n')}
`;
}

/**
 * Hook for updating clinical notes based on user request
 */
export function useNotesUpdater() {
  const { queryGPT } = useGPT();
  const { summarizePaper } = usePaperSummarizer(); // Instantiate paper summarizer hook

  const performNotesUpdate = async (userRequest, currentNotes, record, metadata, additionalContextItems = []) => {
    try {
      const finalPaperSummaries = {};
      const finalClinicalTrials = {};

      for (const item of additionalContextItems) {
        if (item.type === 'paper' && item.data?.pmid) {
          if (item.data.summary) {
            finalPaperSummaries[item.data.pmid] = item.data.summary;
          } else if (item.data.fullText) {
            // Summarize full text if available and no summary exists
            finalPaperSummaries[item.data.pmid] = await summarizePaper(item.data.fullText);
          } else if (item.data.abstract) {
            // Summarize abstract if full text not available and no summary exists
            finalPaperSummaries[item.data.pmid] = await summarizePaper(item.data.abstract);
          } else {
            // Fallback to title if no text for summarization
            finalPaperSummaries[item.data.pmid] = item.data.title || 'No summary available';
          }
        } else if (item.type === 'clinicalTrial' && item.data?.nctId) {
          finalClinicalTrials[item.data.nctId] = formatClinicalTrials(item.data);
        }
      }

      const formattedInput = formatInputDataForUpdate(userRequest, currentNotes, record, metadata, finalPaperSummaries, finalClinicalTrials);
      console.log('formatted input for notes update:', formattedInput);
      
      const response = await queryGPT(formattedInput, {
        systemMessage: {
          role: 'system',
          content: SYSTEM_PROMPT_UPDATE_NOTES
        },
        model: 'cheap' // Or 'smart' if more complex updates are needed
      });

      console.log('gpt notes update response: ', response);

      // Assuming the response is the direct text of the updated notes
      return response.content;

    } catch (error) {
      console.error('Error updating notes:', error);
      throw error;
    }
  };

  return performNotesUpdate;
}
