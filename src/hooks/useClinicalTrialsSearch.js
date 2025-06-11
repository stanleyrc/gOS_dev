import { useState, useCallback } from 'react';

export const useClinicalTrialsSearch = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [range, setRange] = useState([0, 0]);

  const searchClinicalTrials = useCallback(async (filters, pageToken = null) => {
    setIsLoading(true);
    setError(null);

    try {
      const pageSize = 10;
      const queryParams = [
        `pageSize=${pageSize}`, 
        `countTotal=true`
      ];

      if (pageToken) {
        queryParams.push(`pageToken=${encodeURIComponent(pageToken)}`);
      }

      // Add condition and terms to search query
      const searchTerms = [filters.condition, filters.terms]
        .filter(Boolean)
        .join(' AND ');
      if (searchTerms) {
        queryParams.push(`query.term=${encodeURIComponent(searchTerms)}`);
      }

      // Add location if provided
      if (filters.location) {
        queryParams.push(`query.locn=${encodeURIComponent(filters.location)}`);
      }

      // Add study status if selected
      if (filters.studyStatus && filters.studyStatus.length > 0) {
        const statusString = filters.studyStatus.join('|');
        queryParams.push(`filter.overallStatus=${encodeURIComponent(statusString)}`);
      }

      // Construct the full URL
      const searchUrl = `https://clinicaltrials.gov/api/v2/studies?format=json&${queryParams.join('&')}`;

      const searchResponse = await fetch(searchUrl);
      if (!searchResponse.ok) {
        throw new Error(`HTTP error! status: ${searchResponse.status}`);
      }
      
      const searchData = await searchResponse.json();
      const studies = searchData.studies || [];
      console.log(studies[0]);

      // Transform the response data
      const transformedResults = studies.map(study => {
        const protocolSection = study.protocolSection || {};
        const identificationModule = protocolSection.identificationModule || {};
        const statusModule = protocolSection.statusModule || {};
        const descriptionModule = protocolSection.descriptionModule || {};
        const conditionsModule = protocolSection.conditionsModule || {};
        const eligibilityModule = protocolSection.eligibilityModule || {};
        const resultsSection = study.resultsSection || {};

        return {
          nctId: identificationModule.nctId || 'N/A',
          title: identificationModule.briefTitle || 'No title available',
          description: descriptionModule.briefSummary || 'No description available',
          conditions: conditionsModule.conditions || 'No conditions available',
          keywords: conditionsModule.keywords || 'No keywords available',
          status: statusModule.overallStatus || 'Status not available',
          link: `https://clinicaltrials.gov/study/${identificationModule.nctId}`,
          eligibilityCriteria: eligibilityModule.eligibilityCriteria || 'No eligibility criteria available',
          outcomes: resultsSection.outcomeMeasuresModule || null // Add outcomes, default to null if not present
        };
      });

      setResults(transformedResults);
      const startRange = pageToken ? range[0] + studies.length : 1;
      const endRange = startRange + studies.length - 1;
      setRange([startRange, endRange]);

      return {
        nextPageToken: searchData.nextPageToken || null,
        results: transformedResults,
        totalCount: searchData.totalCount || 0
      };

    } catch (err) {
      setError(err.message);
      setResults([]);
      setRange([0, 0]);
      return { nextPageToken: null, results: [] };
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  return {
    searchClinicalTrials,
    results,
    isLoading,
    error,
    range
  };
};
