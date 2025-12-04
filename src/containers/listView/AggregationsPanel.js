import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { Card, Spin, Empty, Tabs, Typography } from "antd";
import { debounce } from "lodash";
import AggregationsTable from "./AggregationsTable";
import { reportFilters } from "../../helpers/filters";

const { Text } = Typography;

// Safe nested property accessor (e.g., "hrd.hrd_score" -> record.hrd.hrd_score)
const getValue = (record, fieldId) => {
  return fieldId.split(".").reduce((obj, key) => obj?.[key], record);
};

class AggregationsPanel extends Component {
  state = {
    filteredRecords: [],
    loading: false,
  };

  debouncedCalculate = debounce(() => {
    this.applyFiltersAndCalculate();
  }, 300);

  componentDidMount() {
    this.applyFiltersAndCalculate();
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
      this.setState({ loading: false, filteredRecords });
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

    const allReportFilters = reportFilters();

    Object.keys(actualSearchFilters).forEach((key) => {
      const fieldDef = dataset?.fields?.find((d) => d.name === key);
      const keyRenderer = fieldDef?.renderer;
      const reportFilter = allReportFilters.find((d) => d.name === key);

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

  render() {
    const { t } = this.props;
    const { filteredRecords, loading } = this.state;

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
              ) : filteredRecords.length === 0 ? (
                <Empty
                  description={t("containers.list-view.aggregations.no_data")}
                />
              ) : (
                <AggregationsTable filteredRecords={filteredRecords} />
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
