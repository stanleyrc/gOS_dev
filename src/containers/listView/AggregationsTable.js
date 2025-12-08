import React, { PureComponent } from "react";
import { withTranslation } from "react-i18next";
import { Table, Typography, Select, Tooltip, Row, Col, Button } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import * as d3 from "d3";

const { Text } = Typography;

// Cache for path splits to avoid repeated string splitting
const pathCache = {};

// Safely access nested properties with cached path splits
const getValue = (record, path) => {
  let parts = pathCache[path];
  if (!parts) {
    parts = path.split(".");
    pathCache[path] = parts;
  }
  return parts.reduce((obj, key) => obj?.[key], record);
};

// Calculate summary statistics for numeric column
const calculateStats = (records, dataIndex) => {
  const values = records
    .map((r) => {
      const val = getValue(r, dataIndex);
      return val != null && !isNaN(val) ? parseFloat(val) : null;
    })
    .filter((v) => v !== null);

  if (values.length === 0) return null;

  const sorted = values.slice().sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);

  return { mean, median, std, count: values.length };
};

class AggregationsTable extends PureComponent {
  state = {
    selectedColumnKeys: [],
    columnStats: {},
  };

  componentDidMount() {
    this.initializeSelectedColumns();
    this.recalculateStats();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.filteredRecords !== this.props.filteredRecords) {
      this.initializeSelectedColumns();
      this.recalculateStats();
    }
  }

  recalculateStats = () => {
    const { filteredRecords } = this.props;
    if (!filteredRecords || filteredRecords.length === 0) {
      this.setState({ columnStats: {} });
      return;
    }

    const numericColumns = [
      { key: "sv_count", dataIndex: "sv_count" },
      { key: "tmb", dataIndex: "tmb" },
      { key: "tumor_median_coverage", dataIndex: "tumor_median_coverage" },
      { key: "normal_median_coverage", dataIndex: "normal_median_coverage" },
      { key: "purity", dataIndex: "purity" },
      { key: "ploidy", dataIndex: "ploidy" },
      { key: "HRDetect", dataIndex: "hrd.hrd_score" },
      { key: "B1+2", dataIndex: "hrd.b1_2_score" },
      { key: "B1", dataIndex: "hrd.b1_score" },
      { key: "B2", dataIndex: "hrd.b2_score" },
    ];
    const columnStats = {};

    numericColumns.forEach(({ key, dataIndex }) => {
      columnStats[key] = calculateStats(filteredRecords, dataIndex);
    });

    this.setState({ columnStats });
  };

  getColumnKeys = () => {
    return [
      "pair",
      "disease",
      "primary_site",
      "tumor_details",
      "inferred_sex",
      "qcEvaluation",
      "sv_count",
      "tmb",
      "tumor_median_coverage",
      "normal_median_coverage",
      "purity",
      "ploidy",
      "HRDetect",
      "B1+2",
      "B1",
      "B2",
      "summary",
    ];
  };

  initializeSelectedColumns = () => {
    // Select all columns by default
    this.setState({ selectedColumnKeys: this.getColumnKeys() });
  };

  handleColumnSelectionChange = (selectedKeys) => {
    // Ensure pair is always selected
    const keysWithPair = selectedKeys.includes("pair")
      ? selectedKeys
      : ["pair", ...selectedKeys];
    this.setState({ selectedColumnKeys: keysWithPair });
  };

  exportToCSV = () => {
    const { filteredRecords } = this.props;
    const { selectedColumnKeys } = this.state;
    const allColumns = this.buildColumns();
    const visibleColumns = allColumns.filter((col) =>
      selectedColumnKeys.includes(col.key)
    );

    // Build CSV header
    const headers = visibleColumns.map((col) => col.label).join(",");

    // Build CSV rows
    const rows = filteredRecords.map((record) => {
      return visibleColumns
        .map((col) => {
          const value = getValue(record, col.dataIndex);
          const stringValue = value == null ? "" : String(value);
          // Remove newlines and replace with spaces
          const cleanedValue = stringValue.replace(/\n/g, " ").replace(/\r/g, "");
          // Escape quotes and wrap in quotes if contains comma or quotes
          const escaped = cleanedValue.replace(/"/g, '""');
          return escaped.includes(",") || escaped.includes('"')
            ? `"${escaped}"`
            : escaped;
        })
        .join(",");
    });

    const csv = [headers, ...rows].join("\n");

    // Create blob and download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "aggregations_table.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  handlePairClick = (event, pair) => {
    const { handleCardClick } = this.props;
    if (handleCardClick && pair) {
      handleCardClick(event, pair);
    }
  };

  buildColumns = () => {
    const { t } = this.props;
    const { columnStats } = this.state;

    // Define all available columns from case properties
    const columnDefs = [
      {
        key: "pair",
        title: t("containers.list-view.aggregations.pair_column") || "Case ID",
        dataIndex: "pair",
        type: "string",
        renderLink: true,
      },
      {
        key: "disease",
        title:
          t("containers.list-view.aggregations.disease_column") || "Disease",
        dataIndex: "disease",
        type: "string",
      },
      {
        key: "primary_site",
        title:
          t("containers.list-view.aggregations.primary_site_column") ||
          "Primary Site",
        dataIndex: "primary_site",
        type: "string",
      },
      {
        key: "tumor_details",
        title:
          t("containers.list-view.aggregations.tumor_details_column") ||
          "Tumor Details",
        dataIndex: "tumor_details",
        type: "string",
      },
      {
        key: "inferred_sex",
        title: t("containers.list-view.aggregations.inferred_sex_column") || "Sex",
        dataIndex: "inferred_sex",
        type: "string",
      },
      {
        key: "qcEvaluation",
        title:
          t("containers.list-view.aggregations.qc_evaluation_column") ||
          "QC Evaluation",
        dataIndex: "qcEvaluation",
        type: "string",
      },
      {
        key: "sv_count",
        title:
          t("containers.list-view.aggregations.sv_count_column") || "SV Count",
        dataIndex: "sv_count",
        type: "numeric",
      },
      {
        key: "tmb",
        title: t("containers.list-view.aggregations.tmb_column") || "TMB",
        dataIndex: "tmb",
        type: "numeric",
      },
      {
        key: "tumor_median_coverage",
        title:
          t("containers.list-view.aggregations.tumor_median_coverage_column") ||
          "Tumor Coverage",
        dataIndex: "tumor_median_coverage",
        type: "numeric",
      },
      {
        key: "normal_median_coverage",
        title:
          t("containers.list-view.aggregations.normal_median_coverage_column") ||
          "Normal Coverage",
        dataIndex: "normal_median_coverage",
        type: "numeric",
      },
      {
        key: "purity",
        title: t("containers.list-view.aggregations.purity_column") || "Purity",
        dataIndex: "purity",
        type: "numeric",
      },
      {
        key: "ploidy",
        title: t("containers.list-view.aggregations.ploidy_column") || "Ploidy",
        dataIndex: "ploidy",
        type: "numeric",
      },
      {
        key: "HRDetect",
        title:
          t("containers.list-view.aggregations.HRDetect_column") || "HRDetect",
        dataIndex: "hrd.hrd_score",
        type: "numeric",
      },
      {
        key: "B1+2",
        title:
          t("containers.list-view.aggregations.B1+2_column") || "B1+2",
        dataIndex: "hrd.b1_2_score",
        type: "numeric",
      },
      {
        key: "B1",
        title:
          t("containers.list-view.aggregations.B1_column") || "B1",
        dataIndex: "hrd.b1_score",
        type: "numeric",
      },
      {
        key: "B2",
        title:
          t("containers.list-view.aggregations.B2_column") || "B2",
        dataIndex: "hrd.b2_score",
        type: "numeric",
      },
      {
        key: "summary",
        title:
          t("containers.list-view.aggregations.summary_column") ||
          "Alterations",
        dataIndex: "summary",
        type: "string",
      },
    ];

    return columnDefs.map((col) => {
      const isNumeric = col.type === "numeric";
      const stats = isNumeric ? columnStats[col.key] : null;

      let headerTitle = col.title;
      if (isNumeric && stats) {
        headerTitle = (
          <Tooltip
            title={
              <div>
                <div>Mean: {d3.format(",.2f")(stats.mean)}</div>
                <div>Median: {d3.format(",.2f")(stats.median)}</div>
                <div>Std: {d3.format(",.2f")(stats.std)}</div>
                <div>Count: {stats.count}</div>
              </div>
            }
          >
            <span>{col.title}</span>
          </Tooltip>
        );
      }

      const isSummary = col.key === "summary";
      
      return {
         key: col.key,
          title: headerTitle,
          label: col.title,
          dataIndex: col.dataIndex,
          width: isSummary ? 800 : 150,
          sorter: (a, b) => {
            const aVal = getValue(a, col.dataIndex);
            const bVal = getValue(b, col.dataIndex);
            
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            
            if (isNumeric) {
              const aNum = parseFloat(aVal);
              const bNum = parseFloat(bVal);
              return aNum - bNum;
            }
            
            return String(aVal).localeCompare(String(bVal));
          },
          render: (_, record) => {
           const value = getValue(record, col.dataIndex);
           if (value == null) return "-";
           if (isNumeric && !isNaN(value)) {
             return d3.format(",")(value);
           }
           const formattedValue = String(value);
           
           // Make pair column a clickable link
           if (col.renderLink) {
             return (
               <a
                 href={`/?report=${value}`}
                 onClick={(e) => {
                   e.preventDefault();
                   this.handlePairClick(e, value);
                 }}
                 style={{ color: "#1890ff", cursor: "pointer" }}
               >
                 {formattedValue}
               </a>
             );
           }
           
           // Make summary cells horizontally scrollable
           if (isSummary) {
             return (
               <div style={{ 
                 minWidth: "700px",
                 minHeight: "60px",
                 overflowX: "auto",
                 overflowY: "hidden",
                 whiteSpace: "nowrap",
                 paddingRight: "8px"
               }}>
                 {formattedValue}
               </div>
             );
           }
           
           return formattedValue;
         },
      };
    });
  };

  render() {
    const { t, filteredRecords } = this.props;
    const { selectedColumnKeys } = this.state;

    const allColumns = this.buildColumns();
    const visibleColumns = allColumns.filter((col) =>
      selectedColumnKeys.includes(col.key)
    );

    return (
      <div className="aggregation-table-container">
        <Row
          className="aggregation-table-header"
          align="middle"
          justify="space-between"
          style={{ marginBottom: "12px" }}
        >
          <Col flex="auto">
            <Text strong>
              {t("containers.list-view.aggregations.data_table_title") ||
                "Data Table"}
            </Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              {t("containers.list-view.aggregations.record_count", {
                count: filteredRecords.length,
              }) || `${filteredRecords.length} records`}
            </Text>
          </Col>
        </Row>

        <Row
          className="aggregation-column-selector"
          align="middle"
          justify="space-between"
          style={{ marginBottom: "12px" }}
        >
          <Col flex="auto">
            <Select
              mode="multiple"
              placeholder={
                t("containers.list-view.aggregations.select-columns") ||
                "Select columns..."
              }
              value={selectedColumnKeys}
              onChange={this.handleColumnSelectionChange}
              style={{ width: "100%" }}
              size="small"
              maxTagCount="responsive"
            >
              {allColumns.map((col) => (
                <Select.Option key={col.key} value={col.key}>
                  {col.label}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col style={{ marginLeft: "8px" }}>
            <Button
              type="primary"
              size="small"
              icon={<DownloadOutlined />}
              onClick={this.exportToCSV}
            >
              {t("containers.list-view.aggregations.export") || "Export CSV"}
            </Button>
          </Col>
        </Row>

        <Table
          columns={visibleColumns}
          dataSource={filteredRecords}
          rowKey={(record, index) => record.pair || index}
          pagination={{
            pageSize: 10,
            hideOnSinglePage: true,
            showSizeChanger: false,
          }}
          size="small"
          scroll={{ x: "100%" }}
          tableLayout="fixed"
          showSorterTooltip={false}
        />
      </div>
    );
  }
}

export default withTranslation("common")(AggregationsTable);
