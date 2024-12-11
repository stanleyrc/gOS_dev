import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { Row, Col, Input, message, Collapse } from "antd";
import { useGPT } from '../../hooks/useGPT';
import { Button } from 'antd';
import { usePaperSummarizer } from '../../hooks/usePaperSummarizer';
import { usePubmedFullText } from '../../hooks/usePubmedFullText';
import PubmedWizard from "../pubmedWizard";
import ClinicalTrialsWizard from "../clinicalTrialsWizard";
import { withTranslation } from "react-i18next";
import Wrapper from "./index.style";
import { extractPMIDs, extractNCTIDs } from '../../helpers/notes';

const API_CALL_DELAY = 1000;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const NotesModal = ({ record, t }) => {
  const [notes, setNotes] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const { queryGPT } = useGPT();
  const { summarizePaper } = usePaperSummarizer();
  const { getFullText, isLoading: isLoadingFullText } = usePubmedFullText();

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
      return;
    }

    const pmids = extractPMIDs(notes);
    if (pmids.length === 0) {
      message.info(t('components.notes-modal.no-pmids-found'));
      return;
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
    } catch (error) {
      console.error('Error fetching full text:', error);
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

  // Add this new handler for GPT submission
  const handleGPTSubmit = async () => {
    if (!notes.trim()) {
      message.warning(t('components.notes-modal.empty-notes'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await queryGPT(notes);
      if (response) {
        const updatedNotes = `${response}`;
        setNotes(updatedNotes);
        if (record) {
          localStorage.setItem(getNotesStorageKey(record), updatedNotes);
        }
      }
    } catch (error) {
      message.error(t('components.notes-modal.gpt-error'));
      console.error('GPT Error:', error);
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
            onClick={handleExtractLiteratureFullText}
            loading={isLoading || isLoadingFullText}
            style={{ marginTop: '8px' }}
          >
            {t("components.notes-modal.extract-literature")}
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

NotesModal.propTypes = {
  record: PropTypes.shape({
    gene: PropTypes.string,
    location: PropTypes.string,
  }),
  t: PropTypes.func.isRequired,
};

export default withTranslation("common")(NotesModal);
