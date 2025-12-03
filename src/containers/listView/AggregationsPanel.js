import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { Card, Select, Spin, Empty, Tabs, Typography } from "antd";
import { debounce } from "lodash";
import * as d3 from "d3";
import AggregationsTable from "./AggregationsTable";
import { reportFilters } from "../../helpers/filters";

const { Text } = Typography;

// Safe nested property accessor (e.g., "hrd.hrd_score" -> record.hrd.hrd_score)
const getValue = (record, fieldId) => {
  return fieldId.split(".").reduce((obj, key) => obj?.[key], record);
};

class AggregationsPanel extends Component {
  state = {
    selectedField: null,
    aggregation: [],
    filteredRecords: [],
    loading: false,
    isLogScale: false,
  };

  debouncedCalculate = debounce(() => {
    this.applyFiltersAndCalculate();
  }, 300);

  componentDidMount() {
    const { dataset } = this.props;
    const defaultField = dataset?.kpiFields?.[0]?.id || null;
    this.setState({ selectedField: defaultField }, () => {
      this.applyFiltersAndCalculate();
    });
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.searchFilters !== this.props.searchFilters ||
      prevProps.datafiles !== this.props.datafiles
    ) {
      this.debouncedCalculate();
    }
  }

  componentWillUnmount() {
    this.debouncedCalculate.cancel();
  }

  applyFiltersAndCalculate = () => {
    this.setState({ loading: true }, () => {
      const filteredRecords = this.applyFilters();
      const { selectedField } = this.state;
      const { dataset } = this.props;

      if (!selectedField || !dataset) {
        this.setState({ loading: false, filteredRecords, aggregation: [] });
        return;
      }

      const fieldDef = dataset.kpiFields.find((f) => f.id === selectedField);
      if (!fieldDef) {
        this.setState({ loading: false, filteredRecords, aggregation: [] });
        return;
      }

      const result = this.calculateAggregation(filteredRecords, fieldDef);
      this.setState({
        loading: false,
        filteredRecords,
        aggregation: result.data,
        isLogScale: result.isLogScale,
      });
    });
  };

  applyFilters = () => {
    const { datafiles, searchFilters, dataset } = this.props;

    if (!datafiles || datafiles.length === 0) {
      return [];
    }

    let records = datafiles.filter((d) => d.visible !== false);

    const actualSearchFilters = Object.fromEntries(
      Object.entries(searchFilters || {}).filter(
        ([key, value]) =>
          key !== "page" &&
          key !== "per_page" &&
          key !== "orderId" &&
          key !== "operator" &&
          !key.endsWith("-operator") &&
          value !== null &&
          value !== undefined &&
          !(Array.isArray(value) && value.length === 0)
      )
    );

    Object.keys(actualSearchFilters).forEach((key) => {
      const fieldDef = dataset?.fields?.find((d) => d.name === key);
      const keyRenderer = fieldDef?.renderer;
      const reportFilter = reportFilters().find((d) => d.name === key);

      if (reportFilter?.external) {
        return;
      }

      if (keyRenderer === "slider") {
        records = records.filter((d) => {
          const value = getValue(d, key);
          if (value == null) return true;
          return (
            value >= actualSearchFilters[key][0] &&
            value <= actualSearchFilters[key][1]
          );
        });
      } else if (keyRenderer === "select") {
        records = records.filter((d) => {
          return actualSearchFilters[key].some((item) => {
            if (item === "null") {
              return d[key] == null;
            }
            const itemArr = Array.isArray(item) ? item : [item];
            const dKeyArr = Array.isArray(d[key]) ? d[key] : [d[key]];
            return itemArr.some((i) => dKeyArr.includes(i));
          });
        });
      } else if (keyRenderer === "cascader") {
        const operator = (searchFilters?.operator || "OR").toUpperCase();
        const selectedItems = actualSearchFilters[key];
        const normalize = (value) => (Array.isArray(value) ? value : [value]);
        const matchesItem = (record, item) => {
          if (item === "null") {
            return record[key] == null;
          }
          const recordValues = normalize(record[key]);
          return normalize(item).some((value) => recordValues.includes(value));
        };

        const cascaderPredicates = {
          AND: (record) =>
            selectedItems.every((item) => matchesItem(record, item)),
          OR: (record) =>
            selectedItems.some((item) => matchesItem(record, item)),
          NOT: (record) =>
            selectedItems.every((item) => !matchesItem(record, item)),
        };

        const applyPredicate =
          cascaderPredicates[operator] || cascaderPredicates.OR;
        records = records.filter(applyPredicate);
      }
    });

    return records;
  };

  calculateAggregation = (records, fieldDef) => {
    if (fieldDef.type === "numeric") {
      return this.aggregateNumeric(records, fieldDef);
    } else if (fieldDef.type === "string") {
      return this.aggregateString(records, fieldDef);
    }
    return { data: [], isLogScale: false };
  };

  aggregateNumeric = (records, fieldDef) => {
    const values = records
      .map((r) => getValue(r, fieldDef.id))
      .filter((v) => v != null && !isNaN(v) && isFinite(v));

    if (values.length === 0) {
      return { data: [], isLogScale: false };
    }

    const [min, max] = d3.extent(values);
    const isLogScale = fieldDef.scale === "log";
    const format = fieldDef.format || ",";

    if (min === max) {
      return {
        data: [{ class: d3.format(format)(min), count: values.length }],
        isLogScale,
      };
    }

    let bins;
    if (isLogScale && min > 0) {
      const logMin = Math.floor(Math.log10(min));
      const logMax = Math.ceil(Math.log10(max));
      const thresholds = [];
      for (let i = logMin; i <= logMax; i++) {
        thresholds.push(Math.pow(10, i));
      }

      const binGenerator = d3.bin().domain([min, max]).thresholds(thresholds);
      bins = binGenerator(values);
    } else {
      const binGenerator = d3.bin().domain([min, max]).thresholds(5);
      bins = binGenerator(values);
    }

    return {
      data: bins
        .map((bin) => ({
          class: `${d3.format(format)(bin.x0)} - ${d3.format(format)(bin.x1)}`,
          count: bin.length,
        }))
        .filter((b) => b.count > 0),
      isLogScale,
    };
  };

  aggregateString = (records, fieldDef) => {
    const { t } = this.props;
    const allValues = records.map((r) => getValue(r, fieldDef.id));

    const nullCount = allValues.filter((v) => v == null).length;
    const validValues = allValues.filter((v) => v != null);

    const grouped = d3.rollup(
      validValues,
      (v) => v.length,
      (v) => String(v)
    );

    const result = Array.from(grouped)
      .map(([value, count]) => ({
        class: value,
        count: count,
      }))
      .sort((a, b) => d3.descending(a.count, b.count));

    if (nullCount > 0) {
      result.push({
        class: t("containers.list-view.aggregations.empty_class"),
        count: nullCount,
      });
    }

    return { data: result, isLogScale: false };
  };

  handleFieldChange = (fieldId) => {
    this.setState({ selectedField: fieldId, loading: true }, () => {
      const { filteredRecords } = this.state;
      const { dataset } = this.props;
      const fieldDef = dataset.kpiFields.find((f) => f.id === fieldId);

      if (!fieldDef) {
        this.setState({ loading: false, aggregation: [] });
        return;
      }

      const result = this.calculateAggregation(filteredRecords, fieldDef);
      this.setState({
        loading: false,
        aggregation: result.data,
        isLogScale: result.isLogScale,
      });
    });
  };

  render() {
    const { t, dataset } = this.props;
    const { selectedField, aggregation, filteredRecords, loading, isLogScale } =
      this.state;

    const fieldDef = dataset?.kpiFields?.find((f) => f.id === selectedField);
    const fieldOptions =
      dataset?.kpiFields?.map((field) => ({
        value: field.id,
        label: field.title || field.shortTitle || field.id,
      })) || [];

    return (
      <Card className="aggregation-panel-card">
        <div className="aggregation-panel-header">
          <Text strong>{t("containers.list-view.aggregations.title")}</Text>
          <Text type="secondary" style={{ marginLeft: 8 }}>
            {t("containers.list-view.aggregations.subtitle", {
              count: filteredRecords.length,
            })}
          </Text>
        </div>

        <div className="aggregation-field-selector">
          <Text style={{ marginRight: 8 }}>
            {t("containers.list-view.aggregations.aggregate_by")}
          </Text>
          <Select
            value={selectedField}
            onChange={this.handleFieldChange}
            style={{ width: 300 }}
            options={fieldOptions}
            loading={loading}
          />
        </div>

        <Tabs
          defaultActiveKey="table"
          items={[
            {
              key: "table",
              label: t("containers.list-view.aggregations.table_tab"),
              children: loading ? (
                <div className="aggregation-loading">
                  <Spin />
                </div>
              ) : aggregation.length === 0 ? (
                <Empty
                  description={t("containers.list-view.aggregations.no_data")}
                />
              ) : (
                <AggregationsTable
                  fieldDef={fieldDef}
                  aggregation={aggregation}
                  totalCount={filteredRecords.length}
                  isLogScale={isLogScale}
                />
              ),
            },
            {
              key: "visualization",
              label: t("containers.list-view.aggregations.visualization_tab"),
              disabled: true,
              children: (
                <Empty
                  description={t(
                    "containers.list-view.aggregations.visualization_coming_soon"
                  )}
                />
              ),
            },
          ]}
        />
      </Card>
    );
  }
}

export default withTranslation("common")(AggregationsPanel);
