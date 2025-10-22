import React, { Component } from "react";
import { Input, Table, Drawer } from "antd";

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

  handleSearchChange = (e) => {
    this.setState({ searchTerm: e.target.value });
  };

  render() {
    const { tableData, title, isOpen, onClose, onSelect, filterFunction = defaultFilterFunction, additionalColumns = [] } = this.props;
    const { searchTerm } = this.state;

    const filteredData = filterFunction(searchTerm, tableData);

    const tableColumns = [
      {
        title: 'Author',
        dataIndex: 'authorName',
        key: 'authorName',
        width: 120,
      },
      {
        title: 'Date',
        dataIndex: 'lastModified',
        key: 'lastModified',
        width: 120,
        render: (date) => date ? new Date(date).toLocaleDateString() : '',
      },
      ...additionalColumns,
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
            placeholder="Search interpretations..."
            value={searchTerm}
            onChange={this.handleSearchChange}
            autoFocus
            style={{ marginBottom: 16 }}
          />
          <Table
            columns={tableColumns}
            dataSource={filteredData}
            rowKey={(record) => `${record.alterationId}___${record.authorId}`}
            pagination={{ pageSize: 10 }}
            size="small"
            onRow={(record) => ({
              onClick: () => onSelect(record),
              style: { cursor: 'pointer' },
            })}
            scroll={{ y: 'calc(100vh - 200px)' }}
          />
        </div>
      </Drawer>
    );
  }
}

export default InterpretationVersionsSidepanel;
