import { useGPT } from './useGPT';


const SYSTEM_PROMPT = `You are a genomic report generator that creates reports in the style of FoundationOne CDx reports. 
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
Only use the headers provided above. Do not include any additional sections.`;

/**
 * Formats input data into a structured string for GPT processing
 */
function formatInputData(record, metadata, paperSummaries, clinicalTrials, clinicianNotes) {
  // Extract only specified fields from record
  const relevantRecord = {
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
  };

  // Extract only specified fields from metadata
  const relevantMetadata = {
    pair: metadata.pair,
    tumor: metadata.tumor,
    disease: metadata.disease,
    primary_site: metadata.primary_site,
    sex: metadata.sex
  };

  // Return formatted string with filtered data
  return `
GENOMIC EVENT RECORD:
${JSON.stringify(relevantRecord, null, 2)}

CASE METADATA:
${JSON.stringify(relevantMetadata, null, 2)}

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
