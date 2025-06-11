import { useState, useCallback } from 'react';

export const usePubmedFullText = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkOpenAccess = async (pmid) => {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${pmid}[pmid] AND "open access"[filter]&retmode=json`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    return data.esearchresult?.idlist?.length > 0;
  };

  const getPMCID = async (pmid) => {
    const converterUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?tool=gOS&email=sdider@nygenome.org&ids=${pmid}&format=json`;
    const response = await fetch(converterUrl);
    const data = await response.json();
    
    // The API returns records array with pmcid if available
    return data.records?.[0]?.pmcid || null;
  };

  const getFullText = useCallback(async (pmid) => {
    if (!pmid) return null;
    
    setIsLoading(true);
    setError(null);

    try {
      // First check if it's open access
      const isOpenAccess = await checkOpenAccess(pmid);
      
      if (isOpenAccess) {
        // Get PMC ID
        const pmcid = await getPMCID(pmid);
        
        if (pmcid) {
          // Get full text XML
          const fullTextUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcid}&rettype=full&retmode=xml`;
          const fullTextResponse = await fetch(fullTextUrl);
          const fullTextXml = await fullTextResponse.text();
          
          // Parse XML
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(fullTextXml, "text/xml");
          
          // Get full text content (you might want to customize this parsing based on your needs)
          const bodyText = xmlDoc.querySelector("body")?.textContent;
          
          return {
            fullText: bodyText,
            isFullText: true,
            xmlContent: fullTextXml
          };
        }
      }

      // If not open access or no PMC ID, fall back to original implementation
      const linksUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&id=${pmid}&cmd=prlinks&retmode=json`;
      const linksResponse = await fetch(linksUrl);
      const linksData = await linksResponse.json();

      // Try to get full text content
      const fullTextUrl = linksData.linksets[0].linksetdbs[0].links[0].url;
      
      return {
        fullText: fullTextUrl,
        isFullText: true
      };

    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    getFullText,
    isLoading,
    error
  };
};
