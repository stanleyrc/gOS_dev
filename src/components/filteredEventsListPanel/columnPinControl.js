import React, { Component } from "react";
import { PushpinFilled, PushpinOutlined } from "@ant-design/icons";

export default class ColumnPinControl extends Component {
  stopPropagation = (event) => event.stopPropagation();

  handleClick = (event) => {
    event.stopPropagation();
    this.props.onToggle(this.props.columnKey);
  };

  render() {
    const { pinned, label } = this.props;
    return (
      <button
        type="button"
        className="filtered-events-pin-control"
        draggable={false}
        aria-label={label}
        aria-pressed={pinned}
        title={label}
        onClick={this.handleClick}
        onKeyDown={this.stopPropagation}
        onKeyUp={this.stopPropagation}
      >
        {pinned ? <PushpinFilled /> : <PushpinOutlined />}
      </button>
    );
  }
}
