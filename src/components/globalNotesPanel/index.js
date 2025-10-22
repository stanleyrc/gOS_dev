import React, { Component } from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { Row, Col, Input, Typography, Button, Table, Drawer } from "antd";
import { linkPmids } from "../../helpers/format";
import interpretationsActions from "../../redux/interpretations/actions";
import { getGlobalNotesInterpretation, getAllInterpretationsForAlteration } from "../../redux/interpretations/selectors";
import EventInterpretation from "../../helpers/EventInterpretation";

const { Text } = Typography;

class GlobalNotesPanel extends Component {
  state = {
    editing: false,
    draft: "",
    showVersions: false,
    searchTerm: "",
    selectedInterpretation: null, // When set, overrides the current one
  };

  handleEditClick = () => {
    const { globalNotesInterpretation } = this.props;
    const currentNotes = globalNotesInterpretation?.data?.notes || "";
    this.setState({ editing: true, draft: currentNotes });
  };

  handleBlur = () => {
    const { draft } = this.state;
    const { caseId, dispatch } = this.props;

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
    this.setState({ showVersions: false, searchTerm: "" });
  };

  handleSearchChange = (e) => {
    this.setState({ searchTerm: e.target.value });
  };

  handleSelectInterpretation = (interpretation) => {
    this.setState({ selectedInterpretation: interpretation, showVersions: false, searchTerm: "" });
  };

  handleClearSelection = () => {
    this.setState({ selectedInterpretation: null });
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
    const { editing, draft, showVersions, searchTerm, selectedInterpretation } = this.state;

    // Determine which interpretation to display
    const displayInterpretation = selectedInterpretation || globalNotesInterpretation;
    const notes = displayInterpretation?.data?.notes || "";

    // Check if current user is viewing their own interpretation
    const isCurrentUser = !selectedInterpretation || displayInterpretation?.isCurrentUser;

    // Format author and date for watermark button
    const authorName = displayInterpretation?.authorName || 'Unknown';
    const lastModified = displayInterpretation?.lastModified;
    const dateStr = lastModified ? new Date(lastModified).toLocaleDateString() : '';
    const watermarkText = `${authorName}${dateStr ? ` ${dateStr}` : ''}`;

    // Filter interpretations for table
    const filteredInterpretations = allGlobalNotesInterpretations.filter(interp => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        (interp.authorName || '').toLowerCase().includes(searchLower) ||
        (interp.lastModified || '').toLowerCase().includes(searchLower) ||
        (interp.data?.notes || '').toLowerCase().includes(searchLower)
      );
    });

    const tableColumns = [
      {
        title: 'Author',
        dataIndex: 'authorName',
        key: 'authorName',
        width: 120,
      },
      {
        title: 'Date',
        dataIndex: 'lastModified',
        key: 'lastModified',
        width: 120,
        render: (date) => date ? new Date(date).toLocaleDateString() : '',
      },
      {
        title: 'Notes',
        dataIndex: ['data', 'notes'],
        key: 'notes',
        ellipsis: true,
      },
    ];

    return (
      <>
        <Row className="ant-panel-container ant-home-plot-container">
          <Col span={24}>
            <div className="desc-block editable-field">
              <div className="desc-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t("components.alteration-card.labels.notes")}:</span>
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

        <Drawer
          title="Global Notes Versions"
          placement="right"
          width={600}
          onClose={this.handleCloseVersions}
          open={showVersions}
          extra={
            selectedInterpretation ? (
              <Button onClick={this.handleClearSelection}>View My Version</Button>
            ) : null
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Input
              placeholder="Search interpretations..."
              value={searchTerm}
              onChange={this.handleSearchChange}
              autoFocus
              style={{ marginBottom: 16 }}
            />
            <Table
              columns={tableColumns}
              dataSource={filteredInterpretations}
              rowKey={(record) => `${record.alterationId}___${record.authorId}`}
              pagination={{ pageSize: 10 }}
              size="small"
              onRow={(record) => ({
                onClick: () => this.handleSelectInterpretation(record),
                style: { cursor: 'pointer' },
              })}
              scroll={{ y: 'calc(100vh - 200px)' }}
            />
          </div>
        </Drawer>
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
