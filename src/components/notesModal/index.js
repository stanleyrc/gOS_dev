import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { Row, Col, Input, message, Collapse } from "antd";
import PubmedWizard from "../pubmedWizard";
import { withTranslation } from "react-i18next";
import Wrapper from "./index.style";

class NotesModal extends Component {
  state = {
    notes: ''
  };

  componentDidMount() {
    if (this.props.record) {
      const storedNotes = localStorage.getItem(this.getNotesStorageKey(this.props.record)) || '';
      this.setState({ notes: storedNotes });
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.record && 
        (prevProps.record?.gene !== this.props.record.gene || 
         prevProps.record?.location !== this.props.record.location)) {
      const storedNotes = localStorage.getItem(this.getNotesStorageKey(this.props.record)) || '';
      this.setState({ notes: storedNotes });
    }
  }

  getNotesStorageKey = (record) => {
    return `event_notes_${record.gene}_${record.location}`;
  };

  handleNotesChange = (e) => {
    const newNotes = e.target.value;
    this.setState({ notes: newNotes });
    
    if (this.props.record) {
      try {
        localStorage.setItem(this.getNotesStorageKey(this.props.record), newNotes);
      } catch (error) {
        if (error.name === 'QuotaExceededError') {
          message.error(this.props.t('components.filtered-events-panel.storage-limit-reached'));
        }
      }
    }
  };

  handleAddCitation = (citation) => {
    this.setState(prevState => ({
      notes: prevState.notes 
        ? `${prevState.notes}\n${citation}` 
        : citation
    }), () => {
      // Save to localStorage after updating
      if (this.props.record) {
        try {
          localStorage.setItem(this.getNotesStorageKey(this.props.record), this.state.notes);
        } catch (error) {
          if (error.name === 'QuotaExceededError') {
            message.error(this.props.t('components.filtered-events-panel.storage-limit-reached'));
          }
        }
      }
    });
  };

  render() {
    const { t } = this.props;
    
    return (
      <Wrapper>
        <Row>
          <Col span={24}>
            <Input.TextArea
              value={this.state.notes}
              onChange={this.handleNotesChange}
              placeholder={t("components.notes-modal.enter-notes")}
              autoSize={{ minRows: 4, maxRows: 12 }}
            />
          </Col>
        </Row>
        <Row style={{ marginTop: '16px' }}>
          <Col span={24}>
            <Collapse>
              <Collapse.Panel 
                header={t("components.notes-modal.literature")} 
                key="literature"
              >
                <PubmedWizard t={t} onAddCitation={this.handleAddCitation} record={this.props.record} />
              </Collapse.Panel>
              <Collapse.Panel 
                header={t("components.notes-modal.clinical-trials")} 
                key="clinical-trials"
              >
                <p>{t("components.notes-modal.clinical-trials-placeholder")}</p>
              </Collapse.Panel>
            </Collapse>
          </Col>
        </Row>
      </Wrapper>
    );
  }
}

NotesModal.propTypes = {
  record: PropTypes.shape({
    gene: PropTypes.string,
    location: PropTypes.string,
  }),
  t: PropTypes.func.isRequired,
};

export default withTranslation("common")(NotesModal);
