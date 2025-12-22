import React, { Component } from "react";
import { Table, Tag, Typography, Space, Tooltip } from "antd";

const { Link, Text } = Typography;

class TrialsTableView extends Component {
  getColumns = () => {
    const { outcomeType } = this.props;

    return [
      {
        title: "NCT ID",
        dataIndex: "nct_id",
        key: "nct_id",
        width: 120,
        sorter: (a, b) => a.nct_id.localeCompare(b.nct_id),
        render: (text, record) => (
          <Link href={record.url} target="_blank">
            {text}
          </Link>
        ),
      },
      {
        title: "Title",
        dataIndex: "brief_title",
        key: "brief_title",
        ellipsis: true,
        sorter: (a, b) => a.brief_title.localeCompare(b.brief_title),
      },
      {
        title: "Phase",
        dataIndex: "phase",
        key: "phase",
        width: 80,
        sorter: (a, b) => (a.phase || "").localeCompare(b.phase || ""),
        render: (text) => <Tag>{text?.replace("PHASE", "P") || "N/A"}</Tag>,
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        width: 180,
        minWidth: 160,
        maxWidth: 200,
        sorter: (a, b) => (a.status || "").localeCompare(b.status || ""),
        render: (text) => {
          const color = text === "COMPLETED" ? "green" : text === "RECRUITING" ? "blue" : "default";
          return <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}><Tag color={color}>{text}</Tag></div>;
        },
      },
      {
        title: "Line",
        dataIndex: "line_of_therapy",
        key: "line_of_therapy",
        width: 140,
        minWidth: 120,
        maxWidth: 160,
        sorter: (a, b) => (a.line_of_therapy || "").localeCompare(b.line_of_therapy || ""),
      },
      {
        title: "Sponsor",
        dataIndex: "sponsor",
        key: "sponsor",
        width: 150,
        ellipsis: true,
        sorter: (a, b) => (a.sponsor || "").localeCompare(b.sponsor || ""),
      },
      {
        title: "Cancer Types",
        dataIndex: "cancer_types",
        key: "cancer_types",
        width: 180,
        minWidth: 140,
        maxWidth: 220,
        render: (types) => (
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "normal" }}>
            <Space size={[0, 4]} wrap>
              {types?.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </Space>
          </div>
        ),
      },
      {
        title: "Biomarkers",
        dataIndex: "biomarkers",
        key: "biomarkers",
        width: 200,
        minWidth: 160,
        maxWidth: 260,
        render: (biomarkers) => (
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "normal" }}>
            <Space size={[0, 4]} wrap>
              {biomarkers?.slice(0, 3).map((b, i) => (
                <Tooltip key={i} title={b.details}>
                  <Tag color={b.status === "POSITIVE" ? "green" : b.status === "NEGATIVE" ? "red" : "blue"}>
                    {b.target}
                    {b.status === "POSITIVE" ? "+" : b.status === "NEGATIVE" ? "-" : ""}
                  </Tag>
                </Tooltip>
              ))}
              {biomarkers?.length > 3 && <Tag>+{biomarkers.length - 3}</Tag>}
            </Space>
          </div>
        ),
      },
      {
        title: outcomeType,
        key: "outcome",
        width: 140,
        render: (_, record) => {
          const outcomes = record.outcomes?.filter((o) => o.outcome_type === outcomeType) || [];
          if (outcomes.length === 0) return "-";
          return (
            <Space direction="vertical" size={0}>
              {outcomes.slice(0, 2).map((o, i) => (
                <Text key={i} style={{ fontSize: 12 }}>
                  {o.value} {o.unit || "mo"} ({o.arm_title?.substring(0, 12)}...)
                </Text>
              ))}
              {outcomes.length > 2 && (
                <Text style={{ fontSize: 11, color: "#888" }}>+{outcomes.length - 2} more</Text>
              )}
            </Space>
          );
        },
      },
    ];
  };

  render() {
    const { trials } = this.props;

    return (
      <Table
        columns={this.getColumns()}
        dataSource={trials.map((t, i) => ({ ...t, key: t.nct_id || i }))}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1200, y: 550 }}
        size="small"
      />
    );
  }
}

export default TrialsTableView;
