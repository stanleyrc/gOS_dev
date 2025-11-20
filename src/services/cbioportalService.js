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
   * Get studies filtered by cancer type (client-side filtering)
   * @param {string} cancerTypeId - The cancer type ID to filter by
   * @param {Array} allStudies - Array of all studies to filter from
   * @returns {Array} Array of study objects for the specified cancer type
   */
  getStudiesByCancerType(cancerTypeId, allStudies = []) {
    if (!cancerTypeId || !allStudies.length) {
      return [];
    }
    return allStudies.filter(study => study.cancerTypeId === cancerTypeId);
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

  /**
   * Get sample lists for a specific study
   * @param {string} studyId - Study ID
   * @returns {Promise<Array>} Array of sample list objects with sample IDs
   * @example
   * const sampleLists = await cbioportalService.getSampleListsByStudy('chol_jhu_2013');
   * // Returns:
   * // [
   * //   {
   * //     "sampleListId": "chol_jhu_2013_all",
   * //     "studyId": "chol_jhu_2013",
   * //     "category": "all_cases_in_study",
   * //     "name": "All samples",
   * //     "description": "All samples (40 samples)",
   * //     "sampleCount": 40,
   * //     "sampleIds": ["CHOL12", "GB07", ...]
   * //   },
   * //   ...
   * // ]
   */
  async getSampleListsByStudy(studyId) {
    try {
      const response = await this.client.get(`/studies/${studyId}/sample-lists`, {
        params: {
          projection: 'DETAILED',
        },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching sample lists for study ${studyId}:`, error);
      throw new Error(`Failed to fetch sample lists: ${error.message}`);
    }
  }

  /**
   * Get unique sample IDs across multiple studies
   * @param {Array<string>} studyIds - List of study IDs
   * @returns {Promise<Array<string>>} Array of unique sample IDs across all studies
   * @example
   * const sampleIds = await cbioportalService.getUniqueSampleIdsByStudies([
   *   'chol_jhu_2013',
   *   'ihch_mskcc_2020'
   * ]);
   * // Returns: ["CHOL12", "GB07", "ICC10", ...]
   */
  async getUniqueSampleIdsByStudies(studyIds = []) {
    try {
      if (!studyIds.length) {
        return [];
      }

      const allSampleIds = new Set();

      // Fetch sample lists for each study
      for (const studyId of studyIds) {
        const sampleLists = await this.getSampleListsByStudy(studyId);
        
        // Extract sample IDs from each sample list
        sampleLists.forEach(sampleList => {
          if (sampleList.sampleIds && Array.isArray(sampleList.sampleIds)) {
            sampleList.sampleIds.forEach(sampleId => {
              allSampleIds.add(sampleId);
            });
          }
        });
      }

      return Array.from(allSampleIds);
    } catch (error) {
      console.error('Error fetching unique sample IDs:', error);
      throw new Error(`Failed to fetch unique sample IDs: ${error.message}`);
    }
  }

  /**
   * Get clinical attribute counts for a list of samples
   * @param {Array<Object>} sampleIdentifiers - List of sample identifiers
   * @param {string} sampleIdentifiers[].sampleId - Sample ID
   * @param {string} sampleIdentifiers[].studyId - Study ID
   * @returns {Promise<Object>} Counts object with clinical attribute statistics
   * @example
   * const counts = await cbioportalService.getClinicalAttributeCounts([
   *   { sampleId: 'ICC10', studyId: 'ihch_ismms_2015' },
   *   { sampleId: 'ICC12', studyId: 'ihch_ismms_2015' }
   * ]);
   */
  async getClinicalAttributeCounts(sampleIdentifiers = []) {
    try {
      const response = await this.client.post(
        '/clinical-attributes/counts/fetch',
        {
          sampleIdentifiers,
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching clinical attribute counts:', error);
      throw new Error(`Failed to fetch clinical attribute counts: ${error.message}`);
    }
  }
}

// Export singleton instance
export const cbioportalService = new CbioPortalService();

// Also export the class for testing purposes
export default CbioPortalService;
