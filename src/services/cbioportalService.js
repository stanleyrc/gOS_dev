/**
 * Service to handle cBioPortal API calls
 * Provides methods to fetch cancer types, studies, and query results
 */

import axios from 'axios';

const CBIOPORTAL_API_BASE = 'https://www.cbioportal.org/api';

class CbioPortalService {
  constructor() {
    this.client = axios.create({
      baseURL: CBIOPORTAL_API_BASE,
      timeout: 30000,
    });
  }

  /**
   * Get list of all cancer types
   * Used to populate dropdown filters
   * @returns {Promise<Array>} Array of cancer type objects
   * @example
   * const cancerTypes = await cbioportalService.getCancerTypes();
   * // Returns:
   * // [
   * //   {
   * //     "name": "Aggressive Angiomyxoma",
   * //     "dedicatedColor": "LightYellow",
   * //     "shortName": "AA",
   * //     "parent": "soft_tissue",
   * //     "cancerTypeId": "aa"
   * //   },
   * //   ...
   * // ]
   */
  async getCancerTypes() {
    try {
      const response = await this.client.get('/cancer-types');
      return response.data;
    } catch (error) {
      console.error('Error fetching cancer types:', error);
      throw new Error(`Failed to fetch cancer types: ${error.message}`);
    }
  }

  /**
   * Get list of all studies with detailed information
   * @returns {Promise<Array>} Array of study objects with metadata
   * @example
   * const studies = await cbioportalService.getStudies();
   * // Returns:
   * // [
   * //   {
   * //     "studyId": "stad_tcga",
   * //     "cancerTypeId": "stad",
   * //     "name": "Stomach Adenocarcinoma (TCGA, Firehose Legacy)",
   * //     "description": "...",
   * //     "publicStudy": true,
   * //     "allSampleCount": 921,
   * //     ...
   * //   },
   * //   ...
   * // ]
   */
  async getStudies() {
    try {
      const response = await this.client.get('/column-store/studies', {
        params: {
          projection: 'DETAILED',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching studies:', error);
      throw new Error(`Failed to fetch studies: ${error.message}`);
    }
  }

  /**
   * Get studies filtered by cancer type
   * @param {string} cancerTypeId - The cancer type ID to filter by
   * @returns {Promise<Array>} Array of study objects for the specified cancer type
   */
  async getStudiesByCancerType(cancerTypeId) {
    try {
      const response = await this.client.get('/column-store/studies', {
        params: {
          projection: 'DETAILED',
          cancerTypeId,
        },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching studies for cancer type ${cancerTypeId}:`, error);
      throw new Error(`Failed to fetch studies: ${error.message}`);
    }
  }

  /**
   * Query gene alterations across multiple studies
   * @param {Object} options - Query options
   * @param {Array<string>} options.studyIds - List of study IDs to search
   * @param {Array<string>} options.geneList - List of genes to search for
   * @param {number} [options.zScoreThreshold=2.0] - Z-score threshold for RNA-seq
   * @param {number} [options.rppaScoreThreshold=2.0] - RPPA score threshold
   * @param {Array<string>} [options.profileFilter] - Profile types to include
   *        (mutations, structural_variants, cna, etc.)
   * @param {string} [options.caseSetId='all'] - Case set ID
   * @returns {Promise<Object>} Query results object
   * @example
   * const results = await cbioportalService.queryGeneAlterations({
   *   studyIds: ['chol_jhu_2013', 'ihch_mskcc_2020'],
   *   geneList: ['NF1', 'CDKN2A'],
   *   profileFilter: ['mutations', 'structural_variants', 'cna'],
   *   zScoreThreshold: 2.0,
   *   rppaScoreThreshold: 2.0,
   * });
   */
  async queryGeneAlterations(options = {}) {
    const {
      studyIds = [],
      geneList = [],
      zScoreThreshold = 2.0,
      rppaScoreThreshold = 2.0,
      profileFilter = ['mutations', 'structural_variants', 'cna'],
      caseSetId = 'all',
    } = options;

    try {
      // Build query parameters
      const params = {
        cancer_study_list: studyIds.join(','),
        gene_list: geneList.join('\n'),
        Z_SCORE_THRESHOLD: zScoreThreshold,
        RPPA_SCORE_THRESHOLD: rppaScoreThreshold,
        profileFilter: profileFilter.join(','),
        case_set_id: caseSetId,
      };

      // Fetch from results endpoint
      const response = await this.client.get('/results', {
        params,
      });

      return response.data;
    } catch (error) {
      console.error('Error querying gene alterations:', error);
      throw new Error(`Failed to query gene alterations: ${error.message}`);
    }
  }

  /**
   * Get gene information
   * @param {string} gene - Gene name/symbol
   * @returns {Promise<Object>} Gene information object
   */
  async getGeneInfo(gene) {
    try {
      const response = await this.client.get(`/genes/${gene}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching info for gene ${gene}:`, error);
      throw new Error(`Failed to fetch gene info: ${error.message}`);
    }
  }

  /**
   * Get mutations for a specific gene in a study
   * @param {string} gene - Gene name/symbol
   * @param {string} studyId - Study ID
   * @returns {Promise<Array>} Array of mutation objects
   */
  async getMutationsForGeneInStudy(gene, studyId) {
    try {
      const response = await this.client.get(`/studies/${studyId}/molecular-profiles`, {
        params: {
          molecularAlterationType: 'MUTATION_EXTENDED',
        },
      });

      // If more detailed mutation data is needed, additional endpoints can be called
      return response.data;
    } catch (error) {
      console.error(`Error fetching mutations for ${gene} in study ${studyId}:`, error);
      throw new Error(`Failed to fetch mutations: ${error.message}`);
    }
  }
}

// Export singleton instance
export const cbioportalService = new CbioPortalService();

// Also export the class for testing purposes
export default CbioPortalService;
