import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { Table, Typography, Select, Tooltip, Row, Col } from "antd";
import * as d3 from "d3";

const { Text } = Typography;

// Safely access nested properties
const getValue = (record, path) => {
  return path.split(".").reduce((obj, key) => obj?.[key], record);
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

class AggregationsTable extends Component {
  state = {
    selectedColumnKeys: [],
  };

  componentDidMount() {
    this.initializeSelectedColumns();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.filteredRecords !== this.props.filteredRecords) {
      this.initializeSelectedColumns();
    }
  }

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

  buildColumns = () => {
    const { t, filteredRecords } = this.props;

    // Define all available columns from case properties
    const columnDefs = [
      {
        key: "pair",
        title: t("containers.list-view.aggregations.pair_column") || "Case ID",
        dataIndex: "pair",
        type: "string",
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
      const stats = isNumeric
        ? calculateStats(filteredRecords, col.dataIndex)
        : null;

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

      return {
        key: col.key,
        title: headerTitle,
        label: col.title,
        dataIndex: col.dataIndex,
        render: (value) => {
          if (value == null) return "-";
          if (isNumeric && !isNaN(value)) {
            return d3.format(",")(value);
          }
          return String(value);
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

    // Add keys to records for React rendering
    const dataWithKeys = filteredRecords.map((item, index) => ({
      ...item,
      key: item.pair || index,
    }));

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
        </Row>

        <Table
          columns={visibleColumns}
          dataSource={dataWithKeys}
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
