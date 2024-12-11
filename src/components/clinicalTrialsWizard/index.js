import React, { useState } from "react";
import { PropTypes } from "prop-types";
import { Input, Form, Checkbox, Switch, Button, Space, Alert, List, Tooltip } from "antd";
import { PlusOutlined } from '@ant-design/icons';
import { useClinicalTrialsSearch } from "../../hooks/useClinicalTrialsSearch";
import { withTranslation } from "react-i18next";
import {
  Container,
  SearchSection,
  FiltersGrid,
  CheckboxGroup,
  ResultsSection,
  ResultsHeader,
  StyledList,
  ViewLink,
  SelectAllContainer,
  SearchButton,
  TitleContainer,
  AddIcon,
  EligibilityCriteria,
  ShowMoreButton,
  PaginationContainer,
  PageInfo
} from "./index.style";

const STUDY_STATUS_OPTIONS = [
  'ACTIVE_NOT_RECRUITING',
  'COMPLETED',
  'ENROLLING_BY_INVITATION',
  'NOT_YET_RECRUITING',
  'RECRUITING',
  'SUSPENDED',
  'TERMINATED',
  'WITHDRAWN',
  'AVAILABLE',
  'NO_LONGER_AVAILABLE',
  'TEMPORARILY_NOT_AVAILABLE',
  'APPROVED_FOR_MARKETING',
  'WITHHELD',
  'UNKNOWN'
];

const formatEligibilityCriteria = (criteria) => {
  if (!criteria) return [];
  
  // Split the text into sections (Inclusion/Exclusion Criteria)
  const sections = criteria.split(/(?=Inclusion Criteria:|Exclusion Criteria:)/g);
  
  return sections.map(section => {
    const [title, ...items] = section.split('*').filter(item => item.trim());
    return {
      title: title.trim(),
      items: items.map(item => item.trim())
    };
  });
};

const ClinicalTrialsWizard = ({ t, record, onAddCitation }) => {
  const [filters, setFilters] = useState({
    condition: '',
    terms: record?.gene || '',
    location: '',
    studyStatus: [],
  });

  const [prevFilters, setPrevFilters] = useState({
    condition: '',
    terms: record?.gene || '',
    location: '',
    studyStatus: [],
  });

  const [nextPageToken, setNextPageToken] = useState(null);
  const [previousPageTokens, setPreviousPageTokens] = useState([]);

  const [total, setTotal] = useState(0);

  const [expandedItems, setExpandedItems] = useState({});
  const {
    searchClinicalTrials,
    results,
    isLoading,
    error,
    range,
  } = useClinicalTrialsSearch();

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const handleSelectAllStatus = (selectAll) => {
    handleFilterChange('studyStatus', selectAll ? STUDY_STATUS_OPTIONS : []);
  };

  const handleSearch = async (direction = 'current') => {
    let tokenToUse = null;
    
    if (direction === 'next') {
      tokenToUse = nextPageToken;
    } else if (direction === 'previous' && previousPageTokens.length > 0) {
      tokenToUse = previousPageTokens[previousPageTokens.length - 1];
    }

    const searchResult = await searchClinicalTrials(
      direction === 'current' ? filters : prevFilters,
      tokenToUse
    );

    if (direction === 'current') {
      setTotal(searchResult.totalCount);
    }

    if (direction === 'next' && nextPageToken) {
      setPreviousPageTokens(prev => [...prev, nextPageToken]);
    } else if (direction === 'previous') {
      setPreviousPageTokens(prev => prev.slice(0, -1));
    } else if (direction === 'current') {
      setPreviousPageTokens([]);
    }

    setNextPageToken(searchResult.nextPageToken);
    
    if (direction === 'current') {
      setPrevFilters(filters);
    }
  };


  const hasNextPage = !!nextPageToken;
  const hasPreviousPage = previousPageTokens.length > 0;
  return (
    <Container>
      <SearchSection>
        <Form layout="vertical">
          <FiltersGrid>
            <Form.Item label={t("components.clinical-trials-wizard.condition")}>
              <Input
                placeholder={t("components.clinical-trials-wizard.condition-placeholder")}
                value={filters.condition}
                onChange={(e) => handleFilterChange('condition', e.target.value)}
              />
            </Form.Item>

            <Form.Item label={t("components.clinical-trials-wizard.terms")}>
              <Input
                placeholder={t("components.clinical-trials-wizard.terms-placeholder")}
                value={filters.terms}
                onChange={(e) => handleFilterChange('terms', e.target.value)}
              />
            </Form.Item>

            <Form.Item label={t("components.clinical-trials-wizard.location")}>
              <Input
                placeholder={t("components.clinical-trials-wizard.location-placeholder")}
                value={filters.location}
                onChange={(e) => handleFilterChange('location', e.target.value)}
              />
            </Form.Item>
            
            <Form.Item 
              label={t("components.clinical-trials-wizard.study-status")}
              style={{ gridColumn: '1 / -1' }}
            >
              <SelectAllContainer>
                <Button size="small" onClick={() => handleSelectAllStatus(true)}>
                  {t("general.select-all")}
                </Button>
                <Button size="small" onClick={() => handleSelectAllStatus(false)}>
                  {t("general.deselect-all")}
                </Button>
              </SelectAllContainer>
              <CheckboxGroup>
                <Checkbox.Group
                  options={STUDY_STATUS_OPTIONS}
                  value={filters.studyStatus}
                  onChange={(values) => handleFilterChange('studyStatus', values)}
                />
              </CheckboxGroup>
            </Form.Item>

          </FiltersGrid> 
          <SearchButton>
            <Button type="primary" onClick={() => handleSearch('current')} block>  {/* Add block prop for full width */}
              {t("general.search")}
            </Button>
          </SearchButton>
        </Form>
      </SearchSection>
      <ResultsSection>
        {error && (
          <Alert
            type="error"
            message={t("components.clinical-trials-wizard.error-searching")}
            description={error}
            style={{ marginBottom: 16 }}
          />
        )}

        {results.length > 0 && (
          <ResultsHeader>
            <h2>{t("components.clinical-trials-wizard.results.title")} ({total})</h2>
          </ResultsHeader>
        )}

        <StyledList
          itemLayout="vertical"
          dataSource={results}
          loading={isLoading}
          locale={{ emptyText: t("components.clinical-trials-wizard.no-results") }}
          renderItem={item => (
            <List.Item>
              <List.Item.Meta
                title={
                  <TitleContainer>
                    <ViewLink 
                      href={item.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      {item.title}
                    </ViewLink>
                    <Tooltip title={t("components.clinical-trials-wizard.results.add-to-notes")}>
                      <AddIcon 
                        onClick={() => onAddCitation && onAddCitation(`NCT ID: ${item.nctId} - ${item.title}`)}
                        style={{ 
                          cursor: 'pointer',
                          fontSize: '16px',
                          color: '#1890ff'
                        }}
                      />
                    </Tooltip>
                  </TitleContainer>
                }
                description={
                  <div>
                    <div>NCT ID: {item.nctId}</div>
                    <div>Status: {item.status}</div>
                  </div>
                }
              />
              {item.description}
              <div>
                {item.description}
                <ShowMoreButton>
                  <Button
                    type="default"
                    onClick={() => setExpandedItems(prev => ({
                      ...prev,
                      [item.nctId]: !prev[item.nctId]
                    }))}
                  >
                    {expandedItems[item.nctId] 
                      ? t("components.clinical-trials-wizard.results.hide-eligibility")
                      : t("components.clinical-trials-wizard.results.show-eligibility")
                    }
                  </Button>
                  {expandedItems[item.nctId] && (
                    <EligibilityCriteria>
                      {formatEligibilityCriteria(item.eligibilityCriteria).map((section, idx) => (
                        <div key={idx}>
                          <h4>{section.title}</h4>
                          <ul>
                            {section.items.map((item, itemIdx) => (
                              <li key={itemIdx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </EligibilityCriteria>
                  )}
                </ShowMoreButton>
              </div>
            </List.Item>
          )}
        />

        {results.length > 0 && (
          <PaginationContainer>
            <Button 
              disabled={!hasPreviousPage}
              onClick={() => handleSearch('previous')}
            >
              {t("general.previous")}
            </Button>
            <PageInfo>
              {`${range[0]}-${range[1]} of ${total}`}
            </PageInfo>
            <Button 
              disabled={!hasNextPage}
              onClick={() => handleSearch('next')}
            >
              {t("general.next")}
            </Button>
          </PaginationContainer>
        )}
      </ResultsSection>
    </Container>
  );
};

ClinicalTrialsWizard.propTypes = {
  t: PropTypes.func.isRequired,
  record: PropTypes.shape({
    gene: PropTypes.string,
    vartype: PropTypes.string,
    effect: PropTypes.string
  }),
  onAddCitation: PropTypes.func
};

export default withTranslation("common")(ClinicalTrialsWizard);
