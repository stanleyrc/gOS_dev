import React, { Component } from "react";
import { Input, Table, Drawer } from "antd";
import { withTranslation } from 'react-i18next';

const defaultFilterFunction = (searchTerm, data) => {
  if (!searchTerm) return data;
  const searchLower = searchTerm.toLowerCase();
  return data.filter(item =>
    (item.authorName || '').toLowerCase().includes(searchLower)
  );
};

class InterpretationVersionsSidepanel extends Component {
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

    const tableColumns = [
      {
        title: () => <span style={{ whiteSpace: 'nowrap' }}>{this.props.t('components.interpretationVersionsSidepanel.authorColumn')}</span>,
        dataIndex: 'authorName',
        key: 'authorName',
        width: 120,
        minWidth: 120,
        sorter: (a, b) => (a.authorName || '').localeCompare(b.authorName || ''),
      },
      {
        title: () => <span style={{ whiteSpace: 'nowrap' }}>{this.props.t('components.interpretationVersionsSidepanel.dateColumn')}</span>,
        dataIndex: 'lastModified',
        key: 'lastModified',
        width: 120,
        minWidth: 120,
        render: (date) => date ? new Date(date).toLocaleString() : '',
        sorter: (a, b) => new Date(a.lastModified || 0) - new Date(b.lastModified || 0),
      },
      {
        title: () => <span style={{ whiteSpace: 'nowrap' }}>Dataset</span>,
        dataIndex: 'dataset',
        key: 'dataset',
        minWidth: 100,
        render: (text, record) => {
          const dataset = datasets.find(d => String(d.id) === String(record.datasetId));
          return dataset ? dataset.title : (record.datasetId || '');
        },
        sorter: (a, b) => {
          const datasetA = datasets.find(d => String(d.id) === String(a.datasetId))?.title || '';
          const datasetB = datasets.find(d => String(d.id) === String(b.datasetId))?.title || '';
          return datasetA.localeCompare(datasetB);
        },
      },
      ...additionalColumns.map(col => ({
        ...col,
        title: typeof col.title === 'string' ? () => <span style={{ whiteSpace: 'nowrap' }}>{col.title}</span> : col.title,
      })),
    ];

    return (
      <Drawer
        title={title}
        placement="right"
        width={600}
        onClose={onClose}
        open={isOpen}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
            rowKey={(record) => `${record.alterationId}___${record.authorId}___${record.caseId}`}
            pagination={{ pageSize: 10 }}
            size="small"
            onRow={(record) => ({
              onClick: () => onSelect(record),
              style: { cursor: 'pointer' },
            })}
            scroll={{ x: 'max-content', y: 'calc(100vh - 200px)' }}
          />
        </div>
      </Drawer>
    );
  }
}

export default withTranslation("common")(InterpretationVersionsSidepanel);
