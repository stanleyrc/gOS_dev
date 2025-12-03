import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { Table, Typography, Tag } from "antd";

const { Text } = Typography;

class AggregationsTable extends Component {
  render() {
    const { t, fieldDef, aggregation, totalCount, isLogScale } = this.props;

    const columns = [
      {
        title: t("containers.list-view.aggregations.class_column"),
        dataIndex: "class",
        key: "class",
        sorter: (a, b) => a.class.localeCompare(b.class),
      },
      {
        title: t("containers.list-view.aggregations.count_column"),
        dataIndex: "count",
        key: "count",
        sorter: (a, b) => a.count - b.count,
        defaultSortOrder: "descend",
      },
      {
        title: t("containers.list-view.aggregations.percentage_column"),
        key: "percentage",
        render: (_, record) => {
          const percentage =
            totalCount > 0 ? (record.count / totalCount) * 100 : 0;
          return `${percentage.toFixed(1)}%`;
        },
        sorter: (a, b) => a.count - b.count,
      },
    ];

    const dataWithKeys = aggregation.map((item, index) => ({
      ...item,
      key: index,
    }));

    const totalRow = {
      key: "total",
      class: t("containers.list-view.aggregations.total_row"),
      count: totalCount,
      isTotal: true,
    };

    return (
      <div className="aggregation-table-container">
        <div className="aggregation-table-header">
          <Text strong>
            {fieldDef?.title || fieldDef?.shortTitle || fieldDef?.id}
          </Text>
          {isLogScale && (
            <Tag color="blue" style={{ marginLeft: 8 }}>
              {t("containers.list-view.aggregations.log_scale")}
            </Tag>
          )}
        </div>
        <Table
          columns={columns}
          dataSource={dataWithKeys}
          pagination={{
            pageSize: 10,
            hideOnSinglePage: true,
            showSizeChanger: false,
          }}
          size="small"
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row className="aggregation-total-row">
                <Table.Summary.Cell index={0}>
                  <Text strong>{totalRow.class}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <Text strong>{totalRow.count}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2}>
                  <Text strong>100.0%</Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </div>
    );
  }
}

export default withTranslation("common")(AggregationsTable);
