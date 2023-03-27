import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Tag, Table } from "antd";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const {} = appActions;

class SummaryTable extends Component {
  render() {
    const { t, selectedFiles } = this.props;
    if (selectedFiles.length < 1) return null;
    const { summary } = selectedFiles[0];
    let data = summary.map((d, i) => {
      return Object.assign({}, d, { key: i });
    });
    const columns = [
      {
        title: "Gene",
        dataIndex: "gene",
        key: "gene",
        render: (text) => (
          <a
            href={`https://www.oncokb.org/gene/${text}`}
            target="_blank"
            rel="noopener noreferrer"
            noreferrer
          >
            {text}
          </a>
        ),
      },
      {
        title: "Role",
        dataIndex: "role",
        key: "role",
      },
      {
        title: "Type",
        key: "type",
        dataIndex: "type",
        render: (_, { type }) => (
          <>
            {type.split(",").map((tag) => {
              let color = tag.length > 1 ? "geekblue" : "green";
              if (tag === "loh") {
                color = "volcano";
              }
              return (
                <Tag color={color} key={tag}>
                  {tag}
                </Tag>
              );
            })}
          </>
        ),
      },
      {
        title: "Tier",
        dataIndex: "tier",
        key: "tier",
        render: (text) => (text ? text : t("general.undefined")),
      },
      {
        title: "Source",
        dataIndex: "source",
        key: "source",
      },
    ];
    return (
      <Wrapper>
        <Table columns={columns} dataSource={data} size="small" />
      </Wrapper>
    );
  }
}
SummaryTable.propTypes = {
  selectedCase: PropTypes.object,
};
SummaryTable.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  selectedFiles: state.App.selectedFiles,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(SummaryTable));
