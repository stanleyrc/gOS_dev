import React, { Component } from "react";
import { Input, Collapse } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { linkPmids } from "../../helpers/format";

class EditableTextBlock extends Component {
  constructor(props) {
    super(props);
    this.state = {
      editing: false,
      draft: props.value || "",
    };
    this.textAreaRef = React.createRef();
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.value !== this.props.value) {
      this.setState({ draft: this.props.value || "" });
    }
    if (!prevState.editing && this.state.editing && this.textAreaRef.current) {
      this.textAreaRef.current.focus({ cursor: "end" });
    }
  }

  handleBlur = () => {
    const { onChange } = this.props;
    const { draft } = this.state;
    onChange(draft || "");
    this.setState({ editing: false });
  };

  setEditing = (editing) => {
    this.setState({ editing });
  };

  handleChange = (e) => {
    this.setState({ draft: e.target.value });
  };

  render() {
    const { title, value, useCollapse, minRows = 3 } = this.props;
    const { editing, draft } = this.state;

    if (editing) {
      return (
        <div className="desc-block editable-field" style={{ marginBottom: 12 }}>
          <div className="desc-title">{title}:</div>
          <Input.TextArea
            ref={this.textAreaRef}
            value={draft}
            onChange={this.handleChange}
            autoSize={{ minRows }}
            onBlur={this.handleBlur}
            style={{ marginTop: 8 }}
          />
        </div>
      );
    }

    if (useCollapse) {
      const html = value && linkPmids(value).replace(/\n/g, "<br/>");

      return (
        <div className="desc-block editable-field" style={{ marginBottom: 12 }}>
          <Collapse
            className="notes-collapse"
            bordered={false}
            ghost
            defaultActiveKey={[]}
          >
            <Collapse.Panel
              key="notes"
              header={
                <div className="notes-header">
                  <span className="notes-header-title">{title}</span>
                  <button
                    type="button"
                    className="edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      this.setEditing(true);
                    }}
                    aria-label={`Edit ${title}`}
                  >
                    <EditOutlined />
                  </button>
                </div>
              }
            >
              <div className="notes-view">
                {value ? (
                  <div
                    className="desc-text"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ) : (
                  <span className="notes-empty">No notes added</span>
                )}
              </div>
            </Collapse.Panel>
          </Collapse>
        </div>
      );
    }

    return (
      <div className="desc-block editable-field">
        <div className="desc-title">
          {title}:
          <button
            type="button"
            className="edit-btn"
            onClick={() => this.setEditing(true)}
            aria-label={`Edit ${title}`}
          >
            <EditOutlined />
          </button>
        </div>
        {value ? (
          <div
            className="desc-text"
            dangerouslySetInnerHTML={{ __html: linkPmids(value) }}
          />
        ) : null}
      </div>
    );
  }
}

export default EditableTextBlock;
