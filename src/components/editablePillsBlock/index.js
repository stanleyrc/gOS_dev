import React, { Component } from "react";
import { Input, Tag } from "antd";
import { EditOutlined } from "@ant-design/icons";

class EditablePillsBlock extends Component {
  constructor(props) {
    super(props);
    const plain = (props.list || []).join(", ");
    this.state = {
      editing: false,
      draft: plain,
    };
    this.inputRef = React.createRef();
  }

  componentDidUpdate(prevProps, prevState) {
    const plain = (this.props.list || []).join(", ");
    const prevPlain = (prevProps.list || []).join(", ");

    if (plain !== prevPlain) {
      this.setState({ draft: plain });
    }

    if (prevProps.readOnly !== this.props.readOnly && this.props.readOnly) {
      this.setState({ editing: false });
    }

  if (!prevState.editing && this.state.editing && this.inputRef.current) {
  this.inputRef.current.focus({ cursor: "end" });
  }
  }

  handleBlur = () => {
    const { onChange } = this.props;
    const { draft } = this.state;
    
    const items = String(draft || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    
    onChange(items);
    this.setState({ editing: false });
  };

  setEditing = (editing) => {
    if (this.props.readOnly) return;
    this.setState({ editing });
  };

  handleChange = (e) => {
    this.setState({ draft: e.target.value });
  };

  render() {
    const { title, list, pillClass, readOnly = false } = this.props;
    const { editing, draft } = this.state;

    return (
      <div className="desc-block editable-field">
      <div className="desc-title">
      {title}:
      {!readOnly && (
      <button
        type="button"
        className="edit-btn"
        onClick={() => this.setEditing(true)}
          aria-label={`Edit ${title}`}
      >
          <EditOutlined />
          </button>
        )}
      </div>
        {editing ? (
          <Input
            ref={this.inputRef}
            value={draft}
            onChange={this.handleChange}
            onBlur={this.handleBlur}
          />
        ) : (
          <div className={`${pillClass === "resistance-tag" ? "resistance-tags" : "therapeutics-tags"}`}>
            {(list || []).length
              ? list.map((v) => (
                  <Tag
                    key={`${title}-${v}`}
                    className={`pill ${pillClass}`}
                    color={pillClass === "resistance-tag" ? "red" : "green"}
                  >
                    {v}
                  </Tag>
                ))
              : null}
          </div>
        )}
      </div>
    );
  }
}

export default EditablePillsBlock;
