import React, { Component } from "react";
import { Input, Table, Drawer } from "antd";
import { withTranslation } from 'react-i18next';
import { getInterpretationSourceDatasetId } from '../../helpers/interpretationHistory';
import orderInterpretationVersionColumns from './columnOrder';
import { withLabelBasedColumnWidth } from './columnWidth';

const defaultFilterFunction = (searchTerm, data) => {
  if (!searchTerm) return data;
  const searchLower = searchTerm.toLowerCase();
  return data.filter(item =>
    (item.authorName || '').toLowerCase().includes(searchLower)
  );
};

export class InterpretationVersionsSidepanel extends Component {
  state = {
    searchTerm: "",
  };

  componentDidUpdate(prevProps) {
    // Trigger refresh when drawer opens
    if (this.props.isOpen && !prevProps.isOpen && this.props.onOpen) {
      this.props.onOpen();
    }
  }

  handleSearchChange = (e) => {
    this.setState({ searchTerm: e.target.value });
  };

  render() {
    const { tableData, title, isOpen, onClose, onSelect, filterFunction = defaultFilterFunction, additionalColumns = [], datasets = [] } = this.props;
    const { searchTerm } = this.state;

    const filteredData = filterFunction(searchTerm, tableData);
    const authorLabel = this.props.t(
      'components.interpretationVersionsSidepanel.authorColumn',
    );
    const dateLabel = this.props.t(
      'components.interpretationVersionsSidepanel.dateColumn',
    );
    const columnTitle = (label) => () => (
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
    );
    const labeledColumn = (column, label) =>
      withLabelBasedColumnWidth(
        {
          ...column,
          title:
            typeof column.title === 'string'
              ? columnTitle(column.title)
              : column.title,
        },
        label,
      );

    const tableColumns = orderInterpretationVersionColumns([
      labeledColumn(
        {
          title: columnTitle(authorLabel),
          dataIndex: 'authorName',
          key: 'authorName',
          width: 120,
          minWidth: 120,
          sorter: (a, b) =>
            (a.authorName || '').localeCompare(b.authorName || ''),
        },
        authorLabel,
      ),
      labeledColumn(
        {
          title: columnTitle(dateLabel),
          dataIndex: 'lastModified',
          key: 'lastModified',
          width: 120,
          minWidth: 120,
          render: (date) => date ? new Date(date).toLocaleString() : '',
          sorter: (a, b) =>
            new Date(a.lastModified || 0) - new Date(b.lastModified || 0),
        },
        dateLabel,
      ),
      labeledColumn(
        {
          title: columnTitle('Dataset'),
          dataIndex: 'dataset',
          key: 'dataset',
          minWidth: 100,
          render: (text, record) => {
            const datasetId = getInterpretationSourceDatasetId(record);
            const dataset = datasets.find(
              d => String(d.id) === String(datasetId),
            );
            return dataset ? dataset.title : (datasetId || '');
          },
          sorter: (a, b) => {
            const datasetIdA = getInterpretationSourceDatasetId(a);
            const datasetIdB = getInterpretationSourceDatasetId(b);
            const datasetA = datasets.find(
              d => String(d.id) === String(datasetIdA),
            )?.title || datasetIdA || '';
            const datasetB = datasets.find(
              d => String(d.id) === String(datasetIdB),
            )?.title || datasetIdB || '';
            return datasetA.localeCompare(datasetB);
          },
        },
        'Dataset',
      ),
      ...additionalColumns.map((column) =>
        labeledColumn(
          column,
          typeof column.title === 'string'
            ? column.title
            : String(column.key || column.dataIndex || ''),
        ),
      ),
    ]);

    return (
      <Drawer
        title={title}
        placement="right"
        width={600}
        onClose={onClose}
        open={isOpen}
        styles={{ body: { overflow: "hidden" } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          <Input
            placeholder={this.props.t('components.interpretationVersionsSidepanel.searchPlaceholder')}
            value={searchTerm}
            onChange={this.handleSearchChange}
            autoFocus
            style={{ marginBottom: 16 }}
          />
          <Table
            columns={tableColumns}
            dataSource={filteredData}
            rowKey={(record) => `${record.datasetId}___${record.alterationId}___${record.authorId}___${record.caseId}`}
            pagination={{ pageSize: 10 }}
            size="small"
            onRow={(record) => ({
              onClick: () => onSelect(record),
              style: { cursor: 'pointer' },
            })}
            scroll={{ x: 'max-content', y: 'calc(100vh - 280px)' }}
          />
        </div>
      </Drawer>
    );
  }
}

export default withTranslation("common")(InterpretationVersionsSidepanel);
