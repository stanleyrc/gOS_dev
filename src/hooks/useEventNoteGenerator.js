import { useGPT } from './useGPT';


const SYSTEM_PROMPT = `You are a genomic report generator that creates reports in the style of FoundationOne CDx reports. 
Format your response in markdown with the following sections:

# GENOMIC FINDINGS
## GENE
[Gene name and details]

## ALTERATION
[Specific alteration details]

## VARIANT ALLELE FREQUENCY (% VAF)
[Frequency information]

## POTENTIAL TREATMENT STRATEGIES
### Targeted Therapies
[List relevant targeted therapies]

### Non-targeted Approaches
[List other treatment approaches]

## FREQUENCY & PROGNOSIS
[Frequency and prognosis information]

Base your analysis on the provided genomic data, research papers, clinical trials, and clinician notes.
Be precise and clinical in your language, similar to FoundationOne CDx reports.`;

/**
 * Formats input data into a structured string for GPT processing
 */
function formatInputData(record, metadata, paperSummaries, clinicalTrials, clinicianNotes) {
  // For now, just concatenate everything with section headers
  return `
GENOMIC EVENT RECORD:
${JSON.stringify(record, null, 2)}

CASE METADATA:
${JSON.stringify(metadata, null, 2)}

RESEARCH PAPER SUMMARIES:
${Object.entries(paperSummaries)
  .map(([pmid, summary]) => `PMID:${pmid}\n${summary}`)
  .join('\n\n')}

RELEVANT CLINICAL TRIALS:
${Object.entries(clinicalTrials)
  .map(([nctid, trial]) => `NCTID:${nctid}\n${trial}`)
  .join('\n\n')}

CLINICIAN NOTES:
${clinicianNotes}
`;
}

/**
 * Hook for generating clinical notes for a specific genomic event
 */
export function useEventNoteGenerator() {
  const { queryGPT } = useGPT();

  const generateNote = async (record, metadata, paperSummaries = {}, clinicalTrials = {}, clinicianNotes = '') => {
    try {
      const formattedInput = formatInputData(record, metadata, paperSummaries, clinicalTrials, clinicianNotes);
      console.log('formatted input:', formattedInput);
      
      const response = await queryGPT(formattedInput, {
        systemMessage: {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        model: 'cheap'
      });

      console.log('gpt: ', response)

      return response;

    } catch (error) {
      console.error('Error generating event note:', error);
      throw error;
    }
  };

  return generateNote;
}
