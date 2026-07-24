import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Card, Spin, Empty, Tabs, Typography } from "antd";
import { debounce } from "lodash";
import AggregationsTable from "./aggregationsTable";
import AggregationsVisualization from "../../components/aggregationsVisualization";
import { loadPathways } from "../../helpers/geneAggregations";
import { filterCaseReportRecords } from "../../helpers/caseReportsSearch";

const { Text } = Typography;

class AggregationsPanel extends Component {
  state = {
    filteredRecords: [],
    loading: false,
    pathwayMap: {},
  };

  debouncedCalculate = debounce(() => {
    this.applyFiltersAndCalculate();
  }, 300);

  componentDidMount() {
    const { settingsData } = this.props;
    const pathwayMap = loadPathways(settingsData);
    this.setState({ pathwayMap }, () => {
      this.applyFiltersAndCalculate();
    });
  }

  componentDidUpdate(prevProps) {
    if (prevProps.settingsData !== this.props.settingsData) {
      const pathwayMap = loadPathways(this.props.settingsData);
      this.setState({ pathwayMap });
    }
    if (
      prevProps.searchFilters !== this.props.searchFilters ||
      prevProps.datafiles !== this.props.datafiles ||
      prevProps.casesWithInterpretations !==
        this.props.casesWithInterpretations
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

  applyFilters = () =>
    filterCaseReportRecords(
      this.props.datafiles || [],
      this.props.searchFilters || {},
      this.props.dataset?.fields || [],
      {
        casesWithInterpretations: this.props.casesWithInterpretations,
      },
    );

  render() {
    const { t, dataset } = this.props;
    const { filteredRecords, loading, pathwayMap } = this.state;

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
                  description={t("containers.list-view.no_data")}
                />
              ) : (
                <AggregationsTable filteredRecords={filteredRecords} dataset={dataset} />
              ),
            },
            {
              key: "visualization",
              label: t("containers.list-view.aggregations.visualization_tab"),
              children: (
                <div style={{ position: "relative" }}>
                  {loading && (
                    <div className="aggregation-loading" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.8)", zIndex: 1 }}>
                      <Spin />
                    </div>
                  )}
                  {!loading && filteredRecords.length === 0 && (
                    <Empty
                      description={t("containers.list-view.no_data")}
                    />
                  )}
                  <div style={{ visibility: loading || filteredRecords.length === 0 ? "hidden" : "visible" }}>
                    <AggregationsVisualization filteredRecords={filteredRecords} dataset={dataset} pathwayMap={pathwayMap} />
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Card>
    );
  }
}

const mapStateToProps = (state) => ({
  casesWithInterpretations: state.CaseReports.casesWithInterpretations,
  settingsData: state.Settings.data,
});

export default connect(mapStateToProps)(withTranslation("common")(AggregationsPanel));
