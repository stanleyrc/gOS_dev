import React, { Component } from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { Row, Col, Input, Typography } from "antd";
import { linkPmids } from "../../helpers/format";
import interpretationsActions from "../../redux/interpretations/actions";
import { getGlobalNotesInterpretation } from "../../redux/interpretations/selectors";
import EventInterpretation from "../../helpers/EventInterpretation";

const { Text } = Typography;

class GlobalNotesPanel extends Component {
  state = {
    editing: false,
    draft: "",
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

  componentDidUpdate(prevProps, prevState) {
    if (!prevState.editing && this.state.editing) {
      // Focus the textarea when entering edit mode
      if (this.textAreaRef) {
        this.textAreaRef.focus({ cursor: "end" });
      }
    }
  }

  render() {
    const { t, globalNotesInterpretation } = this.props;
    const { editing, draft } = this.state;
    const notes = globalNotesInterpretation?.data?.notes || "";

    return (
      <Row className="ant-panel-container ant-home-plot-container">
        <Col span={24}>
          <div className="desc-block editable-field">
            <div className="desc-title">
              {t("components.alteration-card.labels.notes")}:
            </div>
            {editing ? (
              <Input.TextArea
                ref={(ref) => (this.textAreaRef = ref)}
                value={draft}
                onChange={this.handleChange}
                onBlur={this.handleBlur}
                autoSize={{ minRows: 6 }}
                style={{ marginTop: 8, backgroundColor: "#fff" }}
              />
            ) : (
              <div
                className="desc-text"
                onClick={this.handleEditClick}
                style={{
                  marginTop: 8,
                  padding: "4px 11px",
                  backgroundColor: "#fff",
                  border: "1px solid #d9d9d9",
                  borderRadius: "6px",
                  minHeight: "120px", // approx 6 rows
                  cursor: "pointer",
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
    );
  }
}

const mapStateToProps = (state) => ({
  caseId: state?.CaseReport?.id,
  globalNotesInterpretation: getGlobalNotesInterpretation(state),
});

export default connect(mapStateToProps)(withTranslation("common")(GlobalNotesPanel));
