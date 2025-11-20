import { useState, useCallback } from 'react';
import { cbioportalService } from '../services/cbioportalService';

/**
 * Custom hook to interact with cBioPortal API
 * Provides methods to fetch cancer types, studies, and query genes
 */
export const useCbioPortal = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cancerTypes, setCancerTypes] = useState([]);
  const [studies, setStudies] = useState([]);

  /**
   * Fetch all cancer types
   * @returns {Promise<Array>} Array of cancer type objects
   */
  const fetchCancerTypes = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await cbioportalService.getCancerTypes();
      setCancerTypes(data);
      return data;
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch cancer types';
      setError(errorMessage);
      console.error('Error in fetchCancerTypes:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch all studies with detailed information
   * @returns {Promise<Array>} Array of study objects
   */
  const fetchStudies = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await cbioportalService.getStudies();
      setStudies(data);
      return data;
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch studies';
      setError(errorMessage);
      console.error('Error in fetchStudies:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch studies filtered by cancer type
   * @param {string} cancerTypeId - Cancer type ID
   * @returns {Promise<Array>} Array of filtered study objects
   */
  const fetchStudiesByCancerType = useCallback(async (cancerTypeId) => {
    if (!cancerTypeId) {
      setError('Cancer type ID is required');
      return [];
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await cbioportalService.getStudiesByCancerType(cancerTypeId);
      return data;
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch studies for cancer type';
      setError(errorMessage);
      console.error(`Error in fetchStudiesByCancerType(${cancerTypeId}):`, err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Query gene alterations across studies
   * @param {Object} options - Query options
   * @param {Array<string>} options.studyIds - List of study IDs
   * @param {Array<string>} options.geneList - List of gene names
   * @param {number} [options.zScoreThreshold=2.0] - Z-score threshold
   * @param {number} [options.rppaScoreThreshold=2.0] - RPPA score threshold
   * @param {Array<string>} [options.profileFilter] - Profile filters
   * @returns {Promise<Object>} Query results
   */
  const queryGeneAlterations = useCallback(async (options = {}) => {
    if (!options.studyIds || options.studyIds.length === 0) {
      setError('At least one study ID is required');
      return null;
    }

    if (!options.geneList || options.geneList.length === 0) {
      setError('At least one gene is required');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await cbioportalService.queryGeneAlterations(options);
      return data;
    } catch (err) {
      const errorMessage = err.message || 'Failed to query gene alterations';
      setError(errorMessage);
      console.error('Error in queryGeneAlterations:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get gene information
   * @param {string} gene - Gene name/symbol
   * @returns {Promise<Object>} Gene information
   */
  const getGeneInfo = useCallback(async (gene) => {
    if (!gene) {
      setError('Gene name is required');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await cbioportalService.getGeneInfo(gene);
      return data;
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch gene info';
      setError(errorMessage);
      console.error(`Error in getGeneInfo(${gene}):`, err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    // State
    isLoading,
    error,
    cancerTypes,
    studies,

    // Methods
    fetchCancerTypes,
    fetchStudies,
    fetchStudiesByCancerType,
    queryGeneAlterations,
    getGeneInfo,
  };
};
