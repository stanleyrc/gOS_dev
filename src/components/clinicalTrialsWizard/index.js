import React, { useState, useCallback } from "react";
import { PropTypes } from "prop-types";
import { Input, Form, Checkbox, Button, Alert, List, Tooltip, Spin } from "antd";
import { 
  PlusOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  QuestionCircleOutlined,
  LoadingOutlined,
  FileDoneOutlined,
  FileUnknownOutlined 
} from '@ant-design/icons';
import { useClinicalTrialsSearch } from "../../hooks/useClinicalTrialsSearch";
import { useGPTToolRouter } from "../../hooks/useGPTToolRouter";
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
  PageInfo,
  EligibilityCheckButtonContainer
} from "./index.style";
import { filterReportAttributes } from "../../helpers/notes";

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

const ClinicalTrialsWizard = ({ t, record, report, onAddCitation }) => {
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
  const [eligibilityStatus, setEligibilityStatus] = useState({}); // { [nctId]: { status: 'inactivated' | 'loading' | 'eligible' | 'ineligible', reasoning: '' } }
  const [addingNctId, setAddingNctId] = useState(null); // State for loading indicator
  const { routeQuery } = useGPTToolRouter();
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
    } else if (direction === 'previous') {
      // This block is entered only if hasPreviousPage is true,
      // meaning previousPageTokens.length >= 1.
      if (previousPageTokens.length === 1) {
        // We are on Page 2, previousPageTokens = [token_for_P2].
        // Going back to Page 1, which uses a null token.
        tokenToUse = null;
      } else {
        // We are on Page N (N > 2), previousPageTokens = [token_for_P2, ..., token_for_PN].
        // Length is N-1.
        // Going back to Page N-1. The token for Page N-1 is at index (N-1)-2 = N-3.
        // This corresponds to previousPageTokens[previousPageTokens.length - 2].
        tokenToUse = previousPageTokens[previousPageTokens.length - 2];
      }
    }
    // If direction === 'current', tokenToUse remains null (its default initial value).

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

  const handleEligibilityCheck = useCallback(async (trialItem) => {
    if (!record || !trialItem.eligibilityCriteria) {
      // console.error("Patient record or eligibility criteria missing.");
      // Optionally, set an error state for this specific item
      setEligibilityStatus(prev => ({
        ...prev,
        [trialItem.nctId]: { status: 'error', reasoning: 'Patient record or eligibility criteria missing.' }
      }));
      return;
    }

    setEligibilityStatus(prev => ({
      ...prev,
      [trialItem.nctId]: { status: 'loading', reasoning: '' }
    }));

    const reportDetails = report ? JSON.stringify(filterReportAttributes(report), null, 2) : 'No patient report details available.';
    const patientMetadata = `
    Patient Report Details: ${reportDetails}\n
    Alteration details: Gene - ${record.gene || 'N/A'}, Variant Type - ${record.vartype || 'N/A'}, Effect - ${record.effect || 'N/A'}.`;
    const userQuery = `Based on the following patient details: "${patientMetadata}" and the clinical trial eligibility criteria: "${trialItem.eligibilityCriteria}", assess if the patient is potentially eligible. Focus on identifying ineligibility.`;

    try {
      const toolCalls = await routeQuery(userQuery, {
        model: 'cheap',
        tool_choice: { type: "function", function: { name: "checkPatientClinicalTrialEligibility" } }
      });
      
      if (toolCalls && toolCalls.length > 0 && toolCalls[0].function) {
        const args = JSON.parse(toolCalls[0].function.arguments);
        if (args.isPotentiallyEligible !== undefined) {
          setEligibilityStatus(prev => ({
            ...prev,
            [trialItem.nctId]: {
              status: args.isPotentiallyEligible ? 'eligible' : 'ineligible',
              reasoning: args.reasoning || ''
            }
          }));
        } else {
          throw new Error("AI response did not include eligibility status.");
        }
      } else {
        throw new Error("AI response did not select the eligibility tool or was malformed.");
      }
    } catch (err) {
      console.error("Error checking eligibility:", err);
      setEligibilityStatus(prev => ({
        ...prev,
        [trialItem.nctId]: { status: 'error', reasoning: err.message || 'Failed to check eligibility.' }
      }));
    }
  }, [record, routeQuery]);


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
                      {addingNctId === item.nctId ? (
                        <LoadingOutlined style={{ fontSize: '16px', color: '#1890ff', cursor: 'default', marginLeft: '8px' }} />
                      ) : (
                        <AddIcon 
                          onClick={() => {
                            if (onAddCitation) {
                              setAddingNctId(item.nctId);
                              try {
                                const memoryItem = {
                                  id: `trial-${item.nctId}`,
                                  type: 'clinicalTrial',
                                  title: `Trial: ${item.title} (NCT ID: ${item.nctId})`,
                                  data: { ...item, source: 'clinicaltrials' }, // Send the whole item or selected fields
                                  selectedForContext: true // Default to selected, can be changed in NotesModal
                                };
                                onAddCitation(memoryItem);
                              } finally {
                                setAddingNctId(null);
                              }
                            }
                          }}
                          style={{ 
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: '#1890ff',
                            marginLeft: '8px'
                          }}
                        />
                      )}
                    </Tooltip>
                  </TitleContainer>
                }
                description={
                  <div>
                    <div>NCT ID: {item.nctId}</div> {/* Ensure item.nctId is correct key */}
                    <div>Status: {item.status}</div>
                    <div>Conditions: {Array.isArray(item.conditions) && item.conditions.length > 0 ? item.conditions.join(', ') : item.conditions}</div>
                    <div>Keywords: {Array.isArray(item.keywords) && item.keywords.length > 0 ? item.keywords.join(', ') : item.keywords}</div>
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
                  <EligibilityCheckButtonContainer>
                    {(!eligibilityStatus[item.nctId] || eligibilityStatus[item.nctId]?.status === 'inactivated') && (
                      <Tooltip title={t("components.clinical-trials-wizard.results.check-eligibility-tooltip")}>
                        <Button
                          icon={<QuestionCircleOutlined />}
                          onClick={() => handleEligibilityCheck(item)}
                          size="small"
                        >
                          {t("components.clinical-trials-wizard.results.check-eligibility")}
                        </Button>
                      </Tooltip>
                    )}
                    {eligibilityStatus[item.nctId]?.status === 'loading' && (
                      <Button icon={<LoadingOutlined />} disabled size="small">
                        {t("components.clinical-trials-wizard.results.checking-eligibility")}
                      </Button>
                    )}
                    {eligibilityStatus[item.nctId]?.status === 'eligible' && (
                      <Tooltip title={eligibilityStatus[item.nctId]?.reasoning || t("components.clinical-trials-wizard.results.possibly-eligible-tooltip")}>
                        <Button
                          icon={<CheckCircleOutlined style={{ color: 'green' }} />}
                          onClick={() => handleEligibilityCheck(item)} // Allow re-check
                          size="small"
                        >
                          {t("components.clinical-trials-wizard.results.possibly-eligible")}
                        </Button>
                      </Tooltip>
                    )}
                    {eligibilityStatus[item.nctId]?.status === 'ineligible' && (
                      <Tooltip title={eligibilityStatus[item.nctId]?.reasoning || t("components.clinical-trials-wizard.results.ineligible-tooltip")}>
                        <Button
                          icon={<CloseCircleOutlined style={{ color: 'red' }} />}
                          onClick={() => handleEligibilityCheck(item)} // Allow re-check
                          size="small"
                        >
                          {t("components.clinical-trials-wizard.results.ineligible")}
                        </Button>
                      </Tooltip>
                    )}
                     {eligibilityStatus[item.nctId]?.status === 'error' && (
                      <Tooltip title={eligibilityStatus[item.nctId]?.reasoning || t("components.clinical-trials-wizard.results.error-tooltip")}>
                        <Button
                          icon={<CloseCircleOutlined style={{ color: 'orange' }} />}
                          onClick={() => handleEligibilityCheck(item)} // Allow re-try
                          size="small"
                        >
                          {t("components.clinical-trials-wizard.results.error-checking")}
                        </Button>
                      </Tooltip>
                    )}
                    {item.outcomes ? (
                      <Tooltip title={t("components.clinical-trials-wizard.results.has-results")}>
                        <FileDoneOutlined style={{ fontSize: '16px', color: 'green', marginLeft: '8px', cursor: 'default', verticalAlign: 'middle' }} />
                      </Tooltip>
                    ) : (
                      <Tooltip title={t("components.clinical-trials-wizard.results.no-results")}>
                        <FileUnknownOutlined style={{ fontSize: '16px', color: 'grey', marginLeft: '8px', cursor: 'default', verticalAlign: 'middle' }} />
                      </Tooltip>
                    )}
                  </EligibilityCheckButtonContainer>
                  {expandedItems[item.nctId] && (
                    <EligibilityCriteria>
                      {formatEligibilityCriteria(item.eligibilityCriteria).map((section, idx) => (
                        <div key={idx}>
                          <h4>{section.title}</h4>
                          <ul>
                            {section.items.map((criteriaItem, itemIdx) => ( // Renamed inner 'item' to 'criteriaItem'
                              <li key={itemIdx}>{criteriaItem}</li>
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
  report: PropTypes.object,
  onAddCitation: PropTypes.func
};

export default withTranslation("common")(ClinicalTrialsWizard);
