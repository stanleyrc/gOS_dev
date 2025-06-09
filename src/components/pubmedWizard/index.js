import React, { useState } from "react";
import { PropTypes } from "prop-types";
import { Input, Alert, DatePicker, Form, Pagination, Tooltip } from "antd";
import { PlusOutlined } from '@ant-design/icons';
import {
  Container,
  SearchSection,
  FiltersGrid,
  ResultsSection,
  ResultsHeader,
  List,
  ViewLink
} from "./index.style";
import { withTranslation } from "react-i18next";
import { usePubmedSearch } from "../../hooks/usePubmedSearch";
import { useGPT } from "../../hooks/useGPT";

const { RangePicker } = DatePicker;
const PubmedWizard = ({ t, onAddCitation, record }) => {
  const [searchTerm, setSearchTerm] = useState(() => {
    if (!record) return "";
  
    const terms = [];
    if (record.gene) terms.push(record.gene);
    if (record.type) terms.push(record.type);
    if (record.effect && record.effect !== "Unknown") terms.push(record.effect);
  
    return terms.join(" ");
  });
  const [results, setResults] = useState([]);
  const [prevSearchTerm, setPrevSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [range, setRange] = useState([0, 0]);
  const [filters, setFilters] = useState({
    author: '',
    journal: '',
    dateRange: null
  });

  const { searchPubmed, isLoading, error } = usePubmedSearch();
  const { queryGPT } = useGPT();

  const [isRanking, setIsRanking] = useState(false);

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleSearch = async (page = 1) => {
    setIsRanking(true);
    const pageToUse = searchTerm !== prevSearchTerm ? 1 : page;
    const searchResults = await searchPubmed(searchTerm, filters, pageToUse);
    // Extract paper titles from the search results
    const paperTitles = searchResults.articles.map(item => { return {pmid: item.pmid, title: item.title} })
    
    // Determine recommended PMIDs if context is provided
    let recommendedPmids = [];
    if (record && record.variant_summary && paperTitles.length) {
      const prompt = `Of the following papers select the ones most relevant given the context. .:

context:
${record.variant_summary}
The user is a clinician who is investigating a cancer patient harboing this mutation.

papers:
${JSON.stringify(paperTitles)}

Return the pmids only in valid JSON string that can be immediately parsed with JSON.parse() e.g { pmids: <array of pmid numbers as Number> }`;

      try {
        const gptResponse = await queryGPT(prompt);
        console.log("GPT prompt:", prompt);
        console.log("GPT response:", gptResponse);
        /// remove triple backticks, json, and new lines
        const cleanedResponse = gptResponse.replace(/```json/g, "").replace(/```/g, "").replace(/\n/g, "");
        // Expect GPT to return a JSON-formatted array of pmids, e.g. '["123456", "7891011"]'
        recommendedPmids = JSON.parse(cleanedResponse);
        console.log("Recommended PMIDs:", recommendedPmids);
      } catch (e) {
        console.error('Error fetching recommendations:', e);
      }
    }

    // Mark and sort articles: recommended ones first
    const recommendedArticles = [];
    const nonRecommendedArticles = [];
    searchResults.articles.forEach(article => {
      if (recommendedPmids.pmids.includes(Number(article.pmid))) {
        article.recommended = true;
        recommendedArticles.push(article);
      } else {
        article.recommended = false;
        nonRecommendedArticles.push(article);
      }
    });

    const sortedArticles = [...recommendedArticles, ...nonRecommendedArticles];

    setResults(sortedArticles);
    setIsRanking(false);
    setTotal(searchResults.total);
    setRange(searchResults.range);
    setCurrentPage(pageToUse);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    handleSearch(page);
  };

  return (
    <Container>
      <SearchSection>
        <Form layout="vertical">
          <Input.Search
            value={searchTerm}
            onChange={handleSearchChange}
            onSearch={() => {
              setPrevSearchTerm(searchTerm);
              handleSearch(1);
            }}
            placeholder={t("components.pubmed-wizard.search-placeholder")}
            loading={isLoading}
            enterButton
          />
          
          <FiltersGrid>
            <Form.Item label={t("components.pubmed-wizard.author")}>
              <Input
                placeholder={t("components.pubmed-wizard.author-placeholder")}
                value={filters.author}
                onChange={(e) => handleFilterChange('author', e.target.value)}
              />
            </Form.Item>
            
            <Form.Item label={t("components.pubmed-wizard.journal")}>
              <Input
                placeholder={t("components.pubmed-wizard.journal-placeholder")}
                value={filters.journal}
                onChange={(e) => handleFilterChange('journal', e.target.value)}
              />
            </Form.Item>
            
            <Form.Item label={t("components.pubmed-wizard.date-range")}>
              <RangePicker
                style={{ width: '100%' }}
                onChange={(dates) => handleFilterChange('dateRange', dates)}
                placeholder={['YYYY-MM-DD', 'YYYY-MM-DD']}
              />
            </Form.Item>
          </FiltersGrid>
        </Form>
      </SearchSection>

      <ResultsSection>
        {error && (
          <Alert
            type="error"
            message={t("components.pubmed-wizard.error-searching")}
            description={error}
            style={{ marginBottom: 16 }}
          />
        )}

        {results.length > 0 && (
          <ResultsHeader>
            <h2>{t("components.pubmed-wizard.results.title")} ({total})</h2>
          </ResultsHeader>
        )}

        <List
          itemLayout="vertical"
          dataSource={results}
          loading={isLoading || isRanking}
          locale={{ emptyText: t("components.pubmed-wizard.no-results") }}
          pagination={false}
          renderItem={item => (
            <List.Item>
              <List.Item.Meta
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ViewLink 
                      href={item.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      {item.title}
                      {item.recommended && (
                        <span style={{ color: "red", marginLeft: 8, fontWeight: "bold" }}>
                          Recommended
                        </span>
                      )}
                    </ViewLink>
                    <Tooltip title={t("components.pubmed-wizard.results.add-citation-tooltip")}>
                      <PlusOutlined 
                        onClick={(e) => {
                          e.preventDefault();
                          onAddCitation(item.citation);
                        }}
                        style={{ 
                          cursor: 'pointer',
                          fontSize: '16px',
                          color: '#1890ff'
                        }}
                      />
                    </Tooltip>
                  </div>
                }
                description={
                  <>
                    <div>{`${item.journal} (${item.year})`}</div>
                    <div style={{ fontStyle: 'italic' }}>{item.authors}</div>
                  </>
                }
              />
              {item.abstract}
            </List.Item>
          )}
        />
        {total > 0 && (
          <Pagination
            current={currentPage}
            total={total}
            pageSize={10}
            onChange={handlePageChange}
            showTotal={() => `${range[0]}-${range[1]} of ${total}`}
            style={{ marginTop: '20px', textAlign: 'center' }}
            showSizeChanger={false}
            showQuickJumper={true}
          />
        )}
      </ResultsSection>
    </Container>
  );
};

PubmedWizard.propTypes = {
  t: PropTypes.func.isRequired,
};

export default withTranslation("common")(PubmedWizard);
