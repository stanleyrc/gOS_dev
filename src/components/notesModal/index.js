import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import { Button, Row, Col, Input, message, Collapse } from "antd";
import { usePaperSummarizer } from '../../hooks/usePaperSummarizer';
import { usePubmedFullText } from '../../hooks/usePubmedFullText';
import { useClinicalTrialsSearch } from "../../hooks/useClinicalTrialsSearch";
import { useEventNoteGenerator } from "../../hooks/useEventNoteGenerator";
import PubmedWizard from "../pubmedWizard";
import ClinicalTrialsWizard from "../clinicalTrialsWizard";
import { withTranslation } from "react-i18next";
import Wrapper from "./index.style";
import { extractPMIDs, extractNCTIDs, formatClinicalTrials } from '../../helpers/notes';

const API_CALL_DELAY = 1000;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const NotesModal = ({ 
  record, 
  t,
  id,
  report,
  genome,
  mutations,
  allelic,
  chromoBins,
  genomeCoverage,
  hetsnps,
  genes,
  igv 
}) => {
  const [notes, setNotes] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const generateNote = useEventNoteGenerator();
  const { summarizePaper } = usePaperSummarizer();
  const { getFullText, isLoading: isLoadingFullText } = usePubmedFullText();
  const { searchClinicalTrials } = useClinicalTrialsSearch();

  React.useEffect(() => {
    if (record) {
      const storedNotes = localStorage.getItem(getNotesStorageKey(record)) || '';
      setNotes(storedNotes);
    }
  }, [record]);

  const getNotesStorageKey = (record) => {
    return `event_notes_${record.gene}_${record.location}`;
  };

  const handleExtractLiteratureFullText = async () => {
    if (!notes.trim()) {
      message.warning(t('components.notes-modal.empty-notes'));
      return {};
    }

    const pmids = extractPMIDs(notes);
    if (pmids.length === 0) {
      message.info(t('components.notes-modal.no-pmids-found'));
      return {};
    }

    setIsLoading(true);
    const paperSummaries = {};
    try {
      for (const pmid of pmids) {
        const result = await getFullText(pmid);
        if (result) {
          if (result.isFullText) {
            try {
              const summary = await summarizePaper(result.fullText);
              paperSummaries[pmid] = summary;
            } catch (summaryError) {
              console.error(`Error summarizing PMID ${pmid}:`, summaryError);
            }
          } else if (result.abstract) { paperSummaries[pmid] = result.abstract; }
        }
        await delay(API_CALL_DELAY);
      }
      console.log('Paper Summaries:', paperSummaries);
      return paperSummaries;
    } catch (error) {
      console.error('Error fetching full text:', error);
      message.error(t('components.notes-modal.fetch-error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtractClinicalTrials = async () => {
    if (!notes.trim()) {
      message.warning(t('components.notes-modal.empty-notes'));
      return;
    }

    const nctIds = extractNCTIDs(notes);
    if (nctIds.length === 0) {
      message.info(t('components.notes-modal.no-nctids-found'));
      return;
    }

    setIsLoading(true);
    try {
      const idList = nctIds.join(',');
      const results = await searchClinicalTrials({ terms: idList });
      const trialsObject = {};
      
      // Convert array to object keyed by NCT ID
      results.results.forEach(trial => {
        trialsObject[trial.nctId] = formatClinicalTrials(trial);
      });
      
      console.log('Clinical Trials:', trialsObject);
      return trialsObject;
    } catch (error) {
      console.error('Error fetching clinical trials:', error);
      message.error(t('components.notes-modal.fetch-error'));
    } finally {
      setIsLoading(false);
    }
  };


  const handleNotesChange = (e) => {
    const newNotes = e.target.value;
    setNotes(newNotes);
    
    if (record) {
      try {
        localStorage.setItem(getNotesStorageKey(record), newNotes);
      } catch (error) {
        if (error.name === 'QuotaExceededError') {
          message.error(this.props.t('components.filtered-events-panel.storage-limit-reached'));
        }
      }
    }
  };

  const handleAddCitation = (citation) => {
    const updatedNotes = notes ? `${notes}\n${citation}` : citation;
    setNotes(updatedNotes);
    
    if (record) {
      try {
        localStorage.setItem(getNotesStorageKey(record), updatedNotes);
      } catch (error) {
        if (error.name === 'QuotaExceededError') {
          message.error(t('components.filtered-events-panel.storage-limit-reached'));
        }
      }
    }
  };

  const handleGenerateEventNote = async () => {
    if (!notes.trim()) {
      message.warning(t('components.notes-modal.empty-notes'));
      return;
    }

    setIsLoading(true);
    try {
      const paperSummaries = await handleExtractLiteratureFullText();
      const clinicalTrials = await handleExtractClinicalTrials();
    
      const response = await generateNote(
        record,
        report,
        paperSummaries,  
        clinicalTrials,  
        notes 
      )

      if (response) {
        const updatedNotes = `${response}`;
        setNotes(updatedNotes);
        if (record) {
          localStorage.setItem(getNotesStorageKey(record), updatedNotes);
        }
      }
    } catch (error) {
      message.error(t('components.notes-modal.gpt-error'));
      console.error('Note Generation Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Wrapper>
      <Row>
        <Col span={24}>
          <Input.TextArea
            value={notes}
            onChange={handleNotesChange}
            placeholder={t("components.notes-modal.enter-notes")}
            autoSize={{ minRows: 4, maxRows: 12 }}
          />
          <Button 
            type="primary"
            onClick={handleGenerateEventNote}
            loading={isLoading || isLoadingFullText}
            style={{ marginTop: '8px', marginLeft: '8px' }}
          >
            {t("components.notes-modal.generate-note")}
          </Button>
        </Col> 
      </Row>
      <Row style={{ marginTop: '16px' }}>
        <Col span={24}>
          <Collapse>
            <Collapse.Panel 
              header={t("components.notes-modal.literature")} 
              key="literature"
            >
              <PubmedWizard t={t} onAddCitation={handleAddCitation} record={record} />
            </Collapse.Panel>
            <Collapse.Panel 
              header={t("components.notes-modal.clinical-trials")} 
              key="clinical-trials"
            >
              <ClinicalTrialsWizard 
                t={t} 
                record={record} 
                onAddCitation={handleAddCitation}
              />
            </Collapse.Panel>
          </Collapse>
        </Col>
      </Row>
    </Wrapper>
  );
}

const mapStateToProps = (state) => ({
  id: state.CaseReport.id,
  report: state.CaseReport.metadata,
  genome: state.Genome,
  mutations: state.Mutations,
  allelic: state.Allelic,
  chromoBins: state.Settings.chromoBins,
  genomeCoverage: state.GenomeCoverage,
  hetsnps: state.Hetsnps,
  genes: state.Genes,
  igv: state.Igv,
});

NotesModal.propTypes = {
  record: PropTypes.shape({
    gene: PropTypes.string,
    location: PropTypes.string,
  }),
  t: PropTypes.func.isRequired,
  id: PropTypes.string,
  report: PropTypes.object,
  genome: PropTypes.object,
  mutations: PropTypes.object,
  allelic: PropTypes.object,
  chromoBins: PropTypes.object,
  genomeCoverage: PropTypes.object,
  hetsnps: PropTypes.object,
  genes: PropTypes.object,
  igv: PropTypes.object,
};

export default connect(mapStateToProps)(withTranslation("common")(NotesModal));
