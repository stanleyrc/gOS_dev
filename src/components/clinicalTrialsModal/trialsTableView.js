import React, { Component } from "react";
import { Table, Tag, Typography, Space, Tooltip } from "antd";

const { Link, Text } = Typography;

class TrialsTableView extends Component {
  formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
    } catch {
      return dateStr;
    }
  };

  formatOutcomeColumn = (record, outcomeType) => {
    const outcomes = record.outcomes?.filter((o) => o.outcome_type === outcomeType) || [];
    if (outcomes.length === 0) return "-";
    return (
      <Space direction="vertical" size={0}>
        {outcomes.slice(0, 2).map((o, i) => (
          <Text key={i} style={{ fontSize: 12 }}>
            {o.arm_title?.substring(0, 10)}: {o.value?.toFixed?.(1) || o.value} {o.unit || "mo"}
          </Text>
        ))}
        {outcomes.length > 2 && (
          <Text style={{ fontSize: 11, color: "#888" }}>+{outcomes.length - 2} more</Text>
        )}
      </Space>
    );
  };

  getColumns = () => {
    return [
      {
        title: "NCT ID",
        dataIndex: "nct_id",
        key: "nct_id",
        width: 120,
        sorter: (a, b) => a.nct_id.localeCompare(b.nct_id),
        render: (text, record) => (
          <Link href={record.url} target="_blank" onClick={(e) => e.stopPropagation()}>
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
        width: 150,
        sorter: (a, b) => (a.status || "").localeCompare(b.status || ""),
        render: (text) => {
          const color = text === "COMPLETED" ? "green" : text === "RECRUITING" ? "blue" : "default";
          return <Tag color={color}>{text}</Tag>;
        },
      },
      {
        title: "Line",
        dataIndex: "line_of_therapy",
        key: "line_of_therapy",
        width: 100,
        sorter: (a, b) => (a.line_of_therapy || "").localeCompare(b.line_of_therapy || ""),
      },
      {
        title: "Sponsor",
        dataIndex: "sponsor",
        key: "sponsor",
        width: 140,
        ellipsis: true,
        sorter: (a, b) => (a.sponsor || "").localeCompare(b.sponsor || ""),
      },
      {
        title: "Cancer Types",
        dataIndex: "cancer_types",
        key: "cancer_types",
        width: 160,
        render: (types) => (
          <Space size={[0, 4]} wrap>
            {types?.slice(0, 2).map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
            {types?.length > 2 && <Tag>+{types.length - 2}</Tag>}
          </Space>
        ),
      },
      {
        title: "Cancer Stages",
        dataIndex: "cancer_stages",
        key: "cancer_stages",
        width: 140,
        render: (stages) => (
          <Space size={[0, 4]} wrap>
            {stages?.slice(0, 2).map((s) => (
              <Tag key={s} color="orange">{s}</Tag>
            ))}
            {stages?.length > 2 && <Tag>+{stages.length - 2}</Tag>}
          </Space>
        ),
      },
      {
        title: "Biomarkers",
        dataIndex: "biomarkers",
        key: "biomarkers",
        width: 160,
        render: (biomarkers) => (
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
        ),
      },
      {
        title: "Start Date",
        dataIndex: "start_date",
        key: "start_date",
        width: 100,
        sorter: (a, b) => new Date(a.start_date || 0) - new Date(b.start_date || 0),
        render: (date) => this.formatDate(date),
      },
      {
        title: "Completion",
        dataIndex: "completion_date",
        key: "completion_date",
        width: 100,
        sorter: (a, b) => new Date(a.completion_date || 0) - new Date(b.completion_date || 0),
        render: (date) => this.formatDate(date),
      },
      {
        title: "PFS",
        key: "pfs",
        width: 130,
        render: (_, record) => this.formatOutcomeColumn(record, "PFS"),
      },
      {
        title: "OS",
        key: "os",
        width: 130,
        render: (_, record) => this.formatOutcomeColumn(record, "OS"),
      },
      {
        title: "ORR",
        key: "orr",
        width: 130,
        render: (_, record) => this.formatOutcomeColumn(record, "ORR"),
      },
    ];
  };

  render() {
    const { trials, onTrialClick } = this.props;

    return (
      <Table
        columns={this.getColumns()}
        dataSource={trials.map((t, i) => ({ ...t, key: t.nct_id || i }))}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1600, y: 550 }}
        size="small"
        onRow={(record) => ({
          onClick: () => onTrialClick?.(record),
          style: { cursor: onTrialClick ? "pointer" : "default" },
        })}
      />
    );
  }
}

export default TrialsTableView;
