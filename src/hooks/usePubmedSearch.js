import { useState, useCallback } from 'react';

export const usePubmedSearch = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const searchPubmed = useCallback(async (query, filters = {}, page = 1) => {
    const pageNum = Number.isInteger(page) ? page : 1;
    if (!query.trim()) return { articles: [], total: 0 };
    
    setIsLoading(true);
    setError(null);

    try {
      let searchTerms = [query];
      
      if (filters.author) {
        searchTerms.push(`${filters.author}[Author]`);
      }
      
      if (filters.journal) {
        searchTerms.push(`"${filters.journal}"[Journal]`);
      }
      
      if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
        const startDate = filters.dateRange[0].format('YYYY/MM/DD');
        const endDate = filters.dateRange[1].format('YYYY/MM/DD');
        searchTerms.push(`("${startDate}"[Date - Publication] : "${endDate}"[Date - Publication])`);
      }
      
      const searchTerm = searchTerms.join(' AND ');
      const encodedTerm = encodeURIComponent(searchTerm);

      const resultsPerPage = 10;
      const retstart = Math.max(0, (pageNum - 1) * resultsPerPage);

      // First, get the PMIDs
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodedTerm}&retmode=json&retmax=${resultsPerPage}&retstart=${retstart}`;
      console.log(resultsPerPage, retstart, searchUrl);
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();
      console.log(searchData);

      if (searchData.esearchresult.ERROR) {
        throw new Error(searchData.esearchresult.ERROR);
      }

      const pmids = searchData.esearchresult.idlist;
      if (!pmids || pmids.length === 0) {
        return { articles: [], total: 0 };
      }

      // Then, fetch details for each PMID
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
      const fetchResponse = await fetch(fetchUrl);
      const fetchText = await fetchResponse.text();

      // Parse XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(fetchText, "text/xml");

      // Extract article details
      const articles = xmlDoc.getElementsByTagName("PubmedArticle");
      console.log(articles[0])
      const result = Array.from(articles).map(article => {
        const pmid = article.querySelector("PMID")?.textContent;
        const title = article.querySelector("ArticleTitle")?.textContent || 'No title available';
        const abstract = article.querySelector("AbstractText")?.textContent || 'No abstract available';
        const pubDate = article.querySelector("PubDate");
        const year = pubDate ? pubDate.querySelector("Year")?.textContent : 'Year not available';
        const journal = article.querySelector("Journal > Title")?.textContent || 'Journal not available';
        const authorList = Array.from(article.querySelectorAll("Author")).map(author => {
          const lastName = author.querySelector("LastName")?.textContent || '';
          const foreName = author.querySelector("ForeName")?.textContent || '';
          return `${lastName}${foreName ? `, ${foreName}` : ''}`;
        }).join('; ');
        const doi = article.querySelector("ArticleId[IdType='doi']")?.textContent;

        const link = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
        const citation = `${authorList}. ${title} ${journal}. ${year}. doi: ${doi}. PMID: ${pmid}`;

        return {
          pmid,
          title,
          abstract,
          year,
          journal,
          link,
          authors: authorList,
          citation
        };
      });

      const start = Math.max(1, (pageNum - 1) * resultsPerPage + 1);
      const end = Math.min(start + resultsPerPage - 1, parseInt(searchData.esearchresult.count, 10));

      return {
        articles: result,
        total: parseInt(searchData.esearchresult.count, 10),
        range: [start, end]
      };

    } catch (err) {
      setError(err.message);
      return {
        articles: [],
        total: 0,
        range: [0, 0]
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    searchPubmed,
    isLoading,
    error
  };
};
