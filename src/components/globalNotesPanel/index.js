import React, { Component } from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { Row, Col, Input, Button } from "antd";
import { linkPmids } from "../../helpers/format";
import interpretationsActions from "../../redux/interpretations/actions";
import { getGlobalNotesInterpretation, getAllInterpretationsForAlteration } from "../../redux/interpretations/selectors";
import EventInterpretation from "../../helpers/EventInterpretation";
import InterpretationVersionsSidepanel from "../InterpretationVersionsSidepanel";
import { getTimeAgo } from "../../helpers/utility";

class GlobalNotesPanel extends Component {
  state = {
    editing: false,
    draft: "",
    showVersions: false,
    selectedInterpretation: null, // When set, overrides the current one
  };

  handleEditClick = () => {
    const { globalNotesInterpretation } = this.props;
    const currentNotes = globalNotesInterpretation?.data?.notes || "";
    this.setState({ editing: true, draft: currentNotes });
  };

  handleBlur = async () => {
    const { draft } = this.state;
    const { caseId, dispatch } = this.props;

    // Ensure user exists before creating interpretation
    const { ensureUser } = await import("../../helpers/userAuth");
    try {
      await ensureUser();
    } catch (error) {
      // User cancelled sign-in
      this.setState({ editing: false });
      return;
    }

    const eventInterpretation = new EventInterpretation({
      caseId,
      alterationId: "GLOBAL_NOTES",
      data: { notes: draft }
    });

    dispatch(interpretationsActions.updateInterpretation(eventInterpretation.toJSON()));
    this.setState({ editing: false });
  };

  handleChange = (e) => {
    this.setState({ draft: e.target.value });
  };

  handleShowVersions = () => {
    this.setState({ showVersions: true });
  };

  handleCloseVersions = () => {
    this.setState({ showVersions: false });
  };

  handleSelectInterpretation = (interpretation) => {
    this.setState({ selectedInterpretation: interpretation, showVersions: false });
  };

  handleClearSelection = () => {
    this.setState({ selectedInterpretation: null });
  };

  handleRefreshVersions = () => {
    this.props.dispatch(
      interpretationsActions.fetchInterpretationsForCase(this.props.caseId)
    );
  };

  handleCopyVersion = async () => {
    const confirmed = window.confirm("Are you sure you want to overwrite your version with this one?");
    if (!confirmed) return;

    const { selectedInterpretation } = this.state;
    const { caseId, dispatch } = this.props;
    const notes = selectedInterpretation?.data?.notes || "";

    // Ensure user exists before creating interpretation
    const { ensureUser } = await import("../../helpers/userAuth");
    try {
      await ensureUser();
    } catch (error) {
      // User cancelled sign-in
      return;
    }

    const eventInterpretation = new EventInterpretation({
      caseId,
      alterationId: "GLOBAL_NOTES",
      data: { notes }
    });

    dispatch(interpretationsActions.updateInterpretation(eventInterpretation.toJSON()));
    this.setState({ selectedInterpretation: null, editing: true, draft: notes });
  };

  componentDidUpdate(prevProps, prevState) {
    if (!prevState.editing && this.state.editing) {
      // Focus the textarea when entering edit mode
      if (this.textAreaRef) {
        this.textAreaRef.focus({ cursor: "end" });
      }
    }

    // Reset editing state when switching interpretations
    if (prevState.selectedInterpretation !== this.state.selectedInterpretation) {
      this.setState({ editing: false, draft: "" });
    }
  }

  render() {
    const { t, globalNotesInterpretation, allGlobalNotesInterpretations } = this.props;
    const { editing, draft, showVersions, selectedInterpretation } = this.state;

    // Determine which interpretation to display
    const displayInterpretation = selectedInterpretation || globalNotesInterpretation;
    const notes = displayInterpretation?.data?.notes || "";

    // Check if current user is viewing their own interpretation
    const isCurrentUser = !selectedInterpretation || displayInterpretation?.isCurrentUser;

    // Format author and date for watermark button
    const authorName = displayInterpretation?.authorName || 'Switch Version';
    const lastModified = displayInterpretation?.lastModified;
    const dateStr = lastModified ? getTimeAgo(new Date(lastModified)) : '';
    const watermarkText = authorName === 'Switch Version' ? authorName : `Last modified by ${authorName} ${dateStr}`;

    return (
      <>
        <Row className="ant-panel-container ant-home-plot-container">
          <Col span={24}>
            <div className="desc-block editable-field">
              <div className="desc-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t("components.alteration-card.labels.notes")}:</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!isCurrentUser && (
                    <Button
                      type="primary"
                      size="small"
                      onClick={this.handleCopyVersion}
                      style={{ fontSize: '12px', height: 'auto', lineHeight: '1' }}
                    >
                      Copy to My Version
                    </Button>
                  )}
                  <Button
                    type="text"
                    size="small"
                    onClick={this.handleShowVersions}
                    style={{
                      fontSize: '12px',
                      color: '#999',
                      border: 'none',
                      padding: '2px 8px',
                      height: 'auto',
                      lineHeight: '1',
                    }}
                  >
                    {watermarkText}
                  </Button>
                </div>
              </div>
              {editing ? (
                <Input.TextArea
                  ref={(ref) => (this.textAreaRef = ref)}
                  value={draft}
                  onChange={this.handleChange}
                  onBlur={this.handleBlur}
                  autoSize={{ minRows: 6 }}
                  style={{ marginTop: 8, backgroundColor: "#fff" }}
                  readOnly={!isCurrentUser}
                />
              ) : (
                <div
                  className="desc-text"
                  onClick={isCurrentUser ? this.handleEditClick : undefined}
                  style={{
                    marginTop: 8,
                    padding: "4px 11px",
                    backgroundColor: "#fff",
                    border: "1px solid #d9d9d9",
                    borderRadius: "6px",
                    minHeight: "120px", // approx 6 rows
                    cursor: isCurrentUser ? "pointer" : "default",
                    opacity: isCurrentUser ? 1 : 0.7,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: notes
                      ? linkPmids(notes).replace(/\n/g, "<br/>")
                      : '<span class="notes-empty">No notes added</span>',
                  }}
                />
              )}
            </div>
          </Col>
        </Row>

        <InterpretationVersionsSidepanel
          tableData={allGlobalNotesInterpretations}
          title="Notes Versions"
          isOpen={showVersions}
          onOpen={this.handleRefreshVersions}
          onClose={this.handleCloseVersions}
          onSelect={this.handleSelectInterpretation}
          additionalColumns={[
            {
              title: 'Notes',
              dataIndex: ['data', 'notes'],
              key: 'notes',
              ellipsis: true,
            },
          ]}
        />
      </>
    );
  }
}

const mapStateToProps = (state) => ({
  caseId: state?.CaseReport?.id,
  globalNotesInterpretation: getGlobalNotesInterpretation(state),
  allGlobalNotesInterpretations: getAllInterpretationsForAlteration(state, "GLOBAL_NOTES"),
});

export default connect(mapStateToProps)(withTranslation("common")(GlobalNotesPanel));
