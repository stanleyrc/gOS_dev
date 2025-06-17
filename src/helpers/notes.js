import { jsPDF } from 'jspdf';
import 'jspdf/dist/polyfills.es.js';
import { marked } from 'marked';

function renderMarkdownToPDF(markdown, doc, startX, startY, lineHeight, maxWidth) {
  // Parse markdown to HTML tokens
  const tokens = marked.lexer(markdown);
  let currentY = startY;
  const originalSize = doc.getFontSize();

  for (const token of tokens) {
    // Check if we need a new page
    if (currentY > doc.internal.pageSize.height - 20) {
      doc.addPage();
      currentY = 20;
    }

    switch (token.type) {
      case 'heading':
        // Scale font size based on heading level (h1 = 18pt, h2 = 16pt, etc.)
        const fontSize = Math.max(originalSize + (6 - token.depth) * 2, originalSize);
        doc.setFontSize(fontSize);
        doc.setFont(undefined, 'bold');
        const headingText = doc.splitTextToSize(token.text, maxWidth);
        doc.text(headingText, startX, currentY);
        currentY += lineHeight * 1.5 * headingText.length;
        doc.setFontSize(originalSize);
        doc.setFont(undefined, 'normal');
        break;

      case 'list':
        const items = token.items;
        items.forEach((item, index) => {
          const bullet = token.ordered ? `${index + 1}.` : '•';
          const itemText = doc.splitTextToSize(item.text, maxWidth - 10);
          doc.text(bullet, startX, currentY);
          doc.text(itemText, startX + 10, currentY);
          currentY += lineHeight * itemText.length;
        });
        currentY += lineHeight / 2;
        break;

      case 'paragraph':
        const lines = doc.splitTextToSize(token.text, maxWidth);
        doc.text(lines, startX, currentY);
        currentY += lineHeight * lines.length + lineHeight / 2;
        break;

      case 'blockquote':
        doc.setDrawColor(200, 200, 200);
        doc.line(startX - 5, currentY - 5, startX - 5, currentY + lineHeight);
        const quoteText = doc.splitTextToSize(token.text, maxWidth - 10);
        doc.text(quoteText, startX + 5, currentY);
        currentY += lineHeight * quoteText.length + lineHeight;
        break;

      case 'space':
        currentY += lineHeight;
        break;
    }
  }

  return currentY;
}

export function generateEventNotesPDF(events, id) {
  try {
    const doc = new jsPDF();
    const margin = 20;
    let yPos = 20;
    const maxWidth = doc.internal.pageSize.width - 2 * margin;
    const lineHeight = 7;

    // Add title
    doc.setFontSize(16);
    doc.text(`Case ${id}`, margin, yPos);
    yPos += lineHeight * 2;

    // Reset font size for content
    doc.setFontSize(12);

    events.forEach((event) => {
      let notes = localStorage.getItem(`event_notes_${event.gene}_${event.location}`);
      
      if (notes && notes.trim()) {
        // Always put each event on a new page
        if (yPos > margin) {
          doc.addPage();
          yPos = margin;
        }

        // Check if we need a new page
        if (yPos > doc.internal.pageSize.height - margin) {
          doc.addPage();
          yPos = margin;
        }

        // remove ** from markdown
        notes = notes.replace(/\*\*/g, '');
        
        // Parse and render markdown content
        yPos = renderMarkdownToPDF(notes, doc, margin, yPos, lineHeight, maxWidth);
        yPos += lineHeight; // Add space after each event's notes
      }
    });

    return doc;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

export function extractPMIDs(text) {
  // Match "PMID: " followed by numbers
  const pmidRegex = /PMID:\s*(\d+)/g;
  
  // Find all matches and extract just the PMID numbers
  const matches = [...text.matchAll(pmidRegex)];
  
  // Return array of unique PMID numbers
  return [...new Set(matches.map(match => match[1]))];
}

/**
 * Formats clinical trial results into a readable string
 * @param {Object[]} trials - Array of clinical trial objects
 * @returns {string} Formatted string of trial information
 */
export function formatClinicalTrials(trial) {
    return `
Trial ID: ${trial.nctId}
Title: ${trial.title}
Status: ${trial.status}
Link: ${trial.link}
Description: ${trial.description}
Eligibility:\n${trial.eligibilityCriteria.replace(/^/gm, '\t')}
----------------------------------------`;
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

/**
 * Filters a report object to include only specified top-level attributes.
 * @param {Object} report - The report object to filter.
 * @returns {Object} A new object containing only the specified attributes from the report.
 */
export function filterReportAttributes(report) {
  if (!report || typeof report !== 'object') {
    return {};
  }

  const attributesToExtract = [
    'pair',
    'tumor',
    'primary_site',
    'sex',
    'coverage_qc',
    'snvCount',
    'cov_slope',
    'cov_intercept',
    'hrd',
    'tmb',
    'tumor_median_coverage',
    'normal_median_coverage',
    'junction_count',
    'loose_count',
    'svCount',
    'purity',
    'ploidy',
    'lohFraction',
    'sv_types_count',
    'msisensor',
    'summary',
    'tags',
    'hrdScore',
    'hrdB12Score',
    'hrdB1Score',
    'hrdB2Score',
    'msiLabel',
    'msiScore',
  ];

  const filteredReport = {};

  for (const attribute of attributesToExtract) {
    if (report.hasOwnProperty(attribute)) {
      filteredReport[attribute] = report[attribute];
    }
  }

  return filteredReport;
}

/**
 * Estimates the number of tokens in a given text.
 * A common heuristic is that one token is roughly 4 characters.
 * @param {string | object} content - The text string or object to estimate tokens for.
 * @returns {number} Estimated number of tokens.
 */
export function estimateTokens(content) {
  if (typeof content === 'undefined' || content === null) {
    return 0;
  }
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 3);
}
