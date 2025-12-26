import React, { Component } from "react";
import { Table, Tag, Typography, Space, Tooltip, Button } from "antd";
import { DownloadOutlined } from "@ant-design/icons";

const { Link, Text } = Typography;

class TrialsTableView extends Component {
  exportToCSV = () => {
    const { trials } = this.props;

    // Define CSV headers
    const headers = [
      "NCT ID",
      "Title",
      "Phase",
      "Status",
      "Line of Therapy",
      "Sponsor",
      "Cancer Types",
      "Cancer Stages",
      "Biomarkers",
      "Start Date",
      "Completion Date",
      "PFS (median, mo)",
      "OS (median, mo)",
      "ORR (%)",
      "Drugs",
      "URL"
    ];

    // Helper to escape CSV values
    const escapeCSV = (value) => {
      if (value == null) return "";
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Helper to format outcomes for CSV
    const formatOutcomes = (outcomes, type) => {
      const filtered = outcomes?.filter((o) => o.outcome_type === type) || [];
      if (filtered.length === 0) return "";
      return filtered
        .map((o) => `${o.arm_title}: ${o.value}`)
        .join("; ");
    };

    // Helper to get all drugs from a trial
    const getAllDrugs = (trial) => {
      const drugs = Object.values(trial.arm_drugs || {}).flatMap((d) =>
        Array.isArray(d) ? d : [d]
      );
      return [...new Set(drugs)].join("; ");
    };

    // Generate CSV rows
    const rows = trials.map((trial) => [
      trial.nct_id,
      trial.brief_title,
      trial.phase?.replace("PHASE", "Phase "),
      trial.status,
      trial.line_of_therapy,
      trial.sponsor,
      (trial.cancer_types || []).join("; "),
      (trial.cancer_stages || []).join("; "),
      (trial.biomarkers || []).map((b) => `${b.target}${b.status === "POSITIVE" ? "+" : b.status === "NEGATIVE" ? "-" : ""}`).join("; "),
      trial.start_date,
      trial.completion_date,
      formatOutcomes(trial.outcomes, "PFS"),
      formatOutcomes(trial.outcomes, "OS"),
      formatOutcomes(trial.outcomes, "ORR"),
      getAllDrugs(trial),
      trial.url
    ].map(escapeCSV));

    // Combine headers and rows
    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.join(","))
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `clinical_trials_export_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
      <div>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
          <Button
            icon={<DownloadOutlined />}
            onClick={this.exportToCSV}
            disabled={trials.length === 0}
          >
            Export CSV ({trials.length} trials)
          </Button>
        </div>
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
      </div>
    );
  }
}

export default TrialsTableView;
