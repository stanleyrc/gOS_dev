import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import { Button, Row, Col, Input, message, Collapse, Card, Tooltip } from "antd"; // Added Card, Tooltip
import { EditOutlined, SaveOutlined, LinkOutlined, DisconnectOutlined } from '@ant-design/icons'; // Added icons
import ReactMarkdown from 'react-markdown'; // Ensure ReactMarkdown is imported
import { usePaperSummarizer } from '../../hooks/usePaperSummarizer';
import { usePubmedFullText } from '../../hooks/usePubmedFullText';
import { useClinicalTrialsSearch } from "../../hooks/useClinicalTrialsSearch";
import { useEventNoteGenerator } from "../../hooks/useEventNoteGenerator";
import { useNotesUpdater } from "../../hooks/useNotesUpdater"; // Import the new hook
import PubmedWizard from "../pubmedWizard";
import ClinicalTrialsWizard from "../clinicalTrialsWizard";
import { withTranslation } from "react-i18next";
import Wrapper from "./index.style";
import { extractPMIDs, extractNCTIDs, formatClinicalTrials } from '../../helpers/notes';
import NotesChat from '../notesChat'; // Import the new NotesChat component

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
  const [isEditingNotes, setIsEditingNotes] = React.useState(false); // New state for editing mode
  const [forceUpdateNotesTool, setForceUpdateNotesTool] = React.useState(false); // State for forcing updateNotes tool
  const [isLoading, setIsLoading] = React.useState(false);
  const [memoryItems, setMemoryItems] = React.useState([]);
  const generateNote = useEventNoteGenerator();
  const { summarizePaper } = usePaperSummarizer();
  const { getFullText, isLoading: isLoadingFullText } = usePubmedFullText();
  const { searchClinicalTrials } = useClinicalTrialsSearch();
  const performNotesUpdate = useNotesUpdater(); // Instantiate the new hook

  React.useEffect(() => {
    const initialMemoryItems = [];
    // Load stored notes first, as it might be needed for the notes memory item
    if (record) {
      const storedNotes = localStorage.getItem(getNotesStorageKey(record)) || '';
      // Only set notes if it's different to avoid potential loops if notes was a dependency
      // For now, notes is not a direct dependency for this part, but good practice.
      if (notes !== storedNotes) {
        setNotes(storedNotes);
      }
    }

    // Now build memory items including the current notes
    if (record) {
      initialMemoryItems.push({
        id: `record-${record.gene}-${record.location}`, // More specific ID
        type: 'eventRecord',
        title: t('components.notes-modal.memory.record-title', { gene: record.gene || 'N/A', type: record.type || 'N/A' }),
        data: record,
        selectedForContext: true, // Default to selected
      });
    }
    if (report) {
      initialMemoryItems.push({
        id: 'event-report-current', // Assuming one report context at a time
        type: 'eventReport',
        title: t('components.notes-modal.memory.report-title', 'Current Event Report'),
        data: report,
        selectedForContext: true, // Default to selected
      });
    }
    // Add current notes content as a memory item
    initialMemoryItems.push({
      id: 'user-notes-content',
      type: 'userNotes',
      title: t('components.notes-modal.memory.user-notes-title', 'Current Notes Content'),
      data: notes, // Use the current 'notes' state
      selectedForContext: true, // Default to selected
    });

    // Add chat history as a memory item
    initialMemoryItems.push({
      id: 'chat-history-context',
      type: 'chatHistory',
      title: t('components.notes-modal.memory.chat-history-title', 'Chat Conversation History'),
      data: { info: 'Represents the current chat conversation history.' }, // Symbolic data
      selectedForContext: true, // Default to selected
    });

    // Preserve existing papers/trials if any (e.g., if record/report/notes updates but papers were already added)
    setMemoryItems(prevItems => {
      const existingExternalItems = prevItems.filter(
        item => item.type === 'paper' || item.type === 'clinicalTrial'
      );
      // Filter out old core items (record, report, userNotes) if they exist to avoid duplicates from previous renders
      // This ensures that the initialMemoryItems (which are always fresh) replace their old counterparts.
      const newCoreItems = initialMemoryItems.filter(newItem => 
        !existingExternalItems.find(extItem => extItem.id === newItem.id)
      );
      return [...existingExternalItems, ...newCoreItems];
    });

  }, [record, report, notes, t]); // Added 'notes' and 't' to dependency array

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
      return {};
    }

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
    }
  };

  const handleExtractClinicalTrials = async () => {
    if (!notes.trim()) {
      message.warning(t('components.notes-modal.empty-notes'));
      return;
    }

    const nctIds = extractNCTIDs(notes);
    if (nctIds.length === 0) {
      return;
    }

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

  const handleAddCitation = (itemToAdd) => {
    // itemToAdd is now an object { id, type, title, data, selectedForContext }
    
    // Add to memoryItems state, preventing duplicates by ID
    setMemoryItems(prevItems => {
      const existingItem = prevItems.find(item => item.id === itemToAdd.id);
      if (existingItem) {
        message.info(t('components.notes-modal.memory.item-exists', { title: itemToAdd.title }));
        // Optionally, update selectedForContext if it's different
        // return prevItems.map(item => item.id === itemToAdd.id ? { ...item, selectedForContext: itemToAdd.selectedForContext } : item);
        return prevItems;
      }
      return [...prevItems, itemToAdd];
    });

    // Optionally, still append a simple string to the notes text area for visibility
    // const citationString = itemToAdd.type === 'paper' 
    //   ? `PMID: ${itemToAdd.data.pmid} - ${itemToAdd.data.title}`
    //   : `NCT ID: ${itemToAdd.data.nctId} - ${itemToAdd.data.title}`;
    //
    // if (notes && notes.includes(citationString)) {
    //   // Already in notes text, but might not have been in memoryItems if app was reloaded
    //   // message.info(t('components.notes-modal.citation-exists')); 
    //   // No return here, as we want to ensure it's in memoryItems state
    // } else {
    //   const updatedNotes = notes ? `${notes}\n${citationString}` : citationString;
    //   setNotes(updatedNotes);
    //   if (record) {
    //     try {
    //       localStorage.setItem(getNotesStorageKey(record), updatedNotes);
    //     } catch (error) {
    //       if (error.name === 'QuotaExceededError') {
    //         message.error(t('components.filtered-events-panel.storage-limit-reached'));
    //       }
    //     }
    //   }
    // }
  };

  const handleToggleMemoryItemSelection = (itemId) => {
    setMemoryItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId
          ? { ...item, selectedForContext: !item.selectedForContext }
          : item
      )
    );
  };

  const handleExecuteToolCall = async (toolCall, chatMessages) => {
    if (!toolCall || !toolCall.function) {
      console.error("Invalid tool call received in NotesModal");
      return;
    }

    const { name, arguments: argsString } = toolCall.function;
    let parsedArgs;
    try {
      parsedArgs = JSON.parse(argsString);
    } catch (error) {
      console.error("Failed to parse tool call arguments:", error);
      message.error(t('components.notes-modal.tool-args-error'));
      return;
    }

    if (name === "updateNotes") {
      const { userRequest, currentNotes: currentNotesFromTool } = parsedArgs; // currentNotesFromTool is not directly used; 'notes' state is primary.
      
      // Prepare additional context items (papers and clinical trials)
      const selectedPapersAndTrials = memoryItems.filter(
        item => item.selectedForContext && (item.type === 'paper' || item.type === 'clinicalTrial')
      );

      const chatHistoryItem = memoryItems.find(item => item.id === 'chat-history-context');
      const includeChatHistory = chatHistoryItem ? chatHistoryItem.selectedForContext : false;

      setIsLoading(true);
      try {
        // Use the 'notes' state as the most current version of notes for the update
        const updatedNotesContent = await performNotesUpdate(
          userRequest,
          notes, // Pass the current notes from state
          record, // Main genomic event record for the note
          report, // Main case metadata for the note
          selectedPapersAndTrials, // Additional context from memory (papers, trials)
          includeChatHistory ? chatMessages : [] // Pass chat messages if selected
        );

        if (updatedNotesContent) {
          setNotes(updatedNotesContent);
          if (record) {
            localStorage.setItem(getNotesStorageKey(record), updatedNotesContent);
          }
          message.success(t('components.notes-modal.notes-updated'));
        }
      } catch (error) {
        message.error(t('components.notes-modal.gpt-error'));
        console.error('Notes Update Error:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      console.warn(`Unsupported tool call: ${name}`);
      // Potentially handle other tools here or delegate
    }
  };

  const handleClearChatMemory = () => {
    setMemoryItems(prevItems => 
      prevItems.filter(item => item.type !== 'paper' && item.type !== 'clinicalTrial')
    );
    message.success(t('components.notes-modal.memory.cleared-chat-items', 'Added papers and clinical trials cleared from chat memory.'));
  };

  const handleChatHistoryCleared = () => {
    setMemoryItems(prevItems =>
      prevItems.map(item =>
        item.id === 'chat-history-context'
          ? { ...item, data: { info: t('components.notes-modal.memory.chat-history-cleared', 'Chat history has been cleared by the user.') } }
          : item
      )
    );
    // No antd message here, as NotesChat will show one.
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
      <Row gutter={8} align="start"> {/* Adjusted gutter, align items to start for consistent height */}
        <Col span={11}> {/* Column for Notes Text Area / Markdown View */}
          <Card
            title={t("components.notes-modal.notes-title", "Notes")}
            extra={
              <Button 
                icon={isEditingNotes ? <SaveOutlined /> : <EditOutlined />}
                onClick={() => setIsEditingNotes(!isEditingNotes)}
              >
                {isEditingNotes ? t("components.notes-modal.save-notes", "Save") : t("components.notes-modal.edit-notes", "Edit")}
              </Button>
            }
            style={{ height: '500px' }} // Total height for the card
            bodyStyle={{ padding: '0px', height: 'calc(500px - 56px)', overflowY: 'auto' }} // 56px is a common AntD header height; body handles scrolling.
          >
            {isEditingNotes ? (
              <Input.TextArea
                value={notes}
                onChange={handleNotesChange}
                placeholder={t("components.notes-modal.enter-notes")}
                style={{ height: '100%', width: '100%', resize: 'none' }} // Fill the card body
              />
            ) : (
              // This div provides padding and border for the Markdown content, fitting within the scrollable card body.
              // Its height is 100% of the card body, which is scrollable.
              <div style={{ height: '100%', width: '100%', border: '1px solid #d9d9d9', padding: '4px 11px' }}> 
                <ReactMarkdown>{notes || t("components.notes-modal.no-notes-preview", "No notes to display. Click 'Edit' to add notes.")}</ReactMarkdown>
              </div>
            )}
          </Card>
        </Col>
        <Col span={2} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '500px' }}>
          <Tooltip title={forceUpdateNotesTool ? t("components.notes-modal.force-update-tooltip-on", "Disable updating notes with chat") : t("components.notes-modal.force-update-tooltip-off", "Enable updating notes with chat")}>
            <Button
              icon={forceUpdateNotesTool ? <LinkOutlined /> : <DisconnectOutlined />}
              onClick={() => setForceUpdateNotesTool(!forceUpdateNotesTool)}
              type={forceUpdateNotesTool ? "primary" : "default"}
              shape="circle"
              size="large"
              style={{ marginBottom: '8px' }} // Add some margin if needed
            />
          </Tooltip>
        </Col>
        <Col span={11}> {/* Column for Notes Chat */}
          <NotesChat
            style={{ height: '500px' }} // Match notes card height
            t={t}
            record={record} // Kept for potential direct use or if NotesChat needs it for other reasons
            report={report} // Kept for potential direct use
            memoryItems={memoryItems}
            onToggleMemoryItemSelection={handleToggleMemoryItemSelection}
            onClearChatMemory={handleClearChatMemory}
            onExecuteToolCall={handleExecuteToolCall} // Pass the handler to NotesChat
            onChatHistoryCleared={handleChatHistoryCleared} // Pass the new handler
            forceUpdateNotesTool={forceUpdateNotesTool} // Pass the new state
          />
        </Col>
      </Row>
      <Row style={{ marginTop: '16px' }}> {/* Adjusted marginTop */}
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
