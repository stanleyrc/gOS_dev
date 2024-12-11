/**
 * Extracts PMIDs from text containing "PMID: {number}" patterns
 * @param {string} text - Input text that may contain PMID references
 * @returns {string[]} Array of PMID numbers found in the text
 */
export function extractPMIDs(text) {
  // Match "PMID: " followed by numbers
  const pmidRegex = /PMID:\s*(\d+)/g;
  
  // Find all matches and extract just the PMID numbers
  const matches = [...text.matchAll(pmidRegex)];
  
  // Return array of unique PMID numbers
  return [...new Set(matches.map(match => match[1]))];
}

/**
 * Extracts NCT IDs from text containing "NCT ID: {number}" patterns
 * @param {string} text - Input text that may contain NCT ID references
 * @returns {string[]} Array of NCT IDs found in the text
 */
export function extractNCTIDs(text) {
  // Match "NCT ID: " followed by NCT number (NCT followed by 8 digits)
  const nctRegex = /NCT ID:\s*(NCT\d{8})/g;
  
  // Find all matches and extract just the NCT IDs
  const matches = [...text.matchAll(nctRegex)];
  
  // Return array of just the NCT IDs
   return [...new Set(matches.map(match => match[1]))];
}
