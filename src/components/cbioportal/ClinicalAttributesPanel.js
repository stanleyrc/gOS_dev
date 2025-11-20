import React, { Component } from "react";
import { Table, Skeleton, Alert, Row, Col } from "antd";
import { cbioportalService } from "../../services/cbioportalService";

const SAMPLE_THRESHOLD = 50000;

class ClinicalAttributesPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      attributes: [],
      error: null,
      totalSamples: 0,
      exceedsThreshold: false,
    };
    
    // Setup debounce timer
    this.fetchTimeout = null;
  }

  // Simple debounce implementation
  debouncedFetch = () => {
    if (this.fetchTimeout) {
      clearTimeout(this.fetchTimeout);
    }
    this.fetchTimeout = setTimeout(() => {
      this.fetchAttributeData();
    }, 500);
  };

  componentDidMount() {
    const { selectedStudies } = this.props;
    // Trigger fetch on mount if studies already selected
    if (selectedStudies && selectedStudies.length > 0) {
      this.debouncedFetch();
    }
  }

  componentDidUpdate(prevProps) {
    const { selectedStudies } = this.props;
    
    // Trigger fetch when selected studies change
    if (JSON.stringify(selectedStudies) !== JSON.stringify(prevProps.selectedStudies)) {
      this.debouncedFetch();
    }
  }

  componentWillUnmount() {
    // Clean up debounce timer
    if (this.fetchTimeout) {
      clearTimeout(this.fetchTimeout);
    }
  }

  calculateTotalSamples = () => {
    const { allStudies, selectedStudies } = this.props;
    return allStudies
      .filter(s => selectedStudies.includes(s.studyId))
      .reduce((sum, s) => sum + (s.allSampleCount || 0), 0);
  };

  fetchAttributeData = async () => {
    const { selectedStudies, allStudies } = this.props;
    
    // Reset state at start of fetch
    this.setState({
      loading: false,
      attributes: [],
      error: null,
      exceedsThreshold: false,
      totalSamples: 0,
    });

    // If no studies selected, return early
    if (!selectedStudies || selectedStudies.length === 0) {
      return;
    }

    // Calculate total samples
    const totalSamples = this.calculateTotalSamples();
    
    // Check if exceeds threshold
    if (totalSamples > SAMPLE_THRESHOLD) {
      this.setState({
        exceedsThreshold: true,
        totalSamples,
      });
      return;
    }

    // Set loading state and proceed with fetch
    this.setState({ loading: true, totalSamples });

    try {
      // Fetch sample IDs for selected studies
      const sampleIds = await cbioportalService.getUniqueSampleIdsByStudies(selectedStudies);
      
      if (!sampleIds || sampleIds.length === 0) {
        this.setState({
          loading: false,
          attributes: [],
          error: "No samples found for selected studies",
        });
        return;
      }

      // Build sample identifiers array
      const sampleIdentifiers = sampleIds.map(sampleId => ({
        sampleId,
        studyId: selectedStudies[0], // Use first selected study; in real scenario might need mapping
      }));

      // Fetch clinical attribute counts
      const counts = await cbioportalService.getClinicalAttributeCounts(sampleIdentifiers);
      
      // Transform counts to table data
      const tableData = this.transformCountsToTableData(counts, totalSamples);
      
      this.setState({
        loading: false,
        attributes: tableData,
        error: null,
      });
    } catch (error) {
      console.error("Error fetching clinical attributes:", error);
      this.setState({
        loading: false,
        error: `Failed to fetch clinical attributes: ${error.message}`,
        attributes: [],
      });
    }
  };

  transformCountsToTableData = (counts, totalSamples) => {
    // counts is an array of objects with clinicalAttributeId and count
    if (!Array.isArray(counts)) {
      return [];
    }

    return counts.map((item, index) => ({
      id: item.clinicalAttributeId,
      key: `${item.clinicalAttributeId}-${index}`,
      attribute: item.clinicalAttributeId,
      count: item.count,
      percentage: totalSamples > 0 ? ((item.count / totalSamples) * 100).toFixed(2) : 0,
    }));
  };

  render() {
    const { loading, attributes, error, exceedsThreshold, totalSamples } = this.state;
    const { selectedStudies } = this.props;

    // Show placeholder if no studies selected
    if (!selectedStudies || selectedStudies.length === 0) {
      return (
        <div style={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          border: '1px solid #f0f0f0',
          borderRadius: '4px',
          padding: '8px',
          backgroundColor: '#fafafa',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '200px'
        }}>
          <div style={{ fontSize: "12px", color: "#999" }}>
            Select studies to view attributes
          </div>
        </div>
      );
    }

    // Show warning if exceeds threshold
    if (exceedsThreshold) {
      return (
        <div style={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          border: '1px solid #f0f0f0',
          borderRadius: '4px',
          padding: '8px',
          backgroundColor: '#fafafa'
        }}>
          <Alert
            message="Too many samples selected"
            description={`The selected studies contain ${totalSamples.toLocaleString()} samples (more than ${SAMPLE_THRESHOLD.toLocaleString()} limit). Clinical attribute data cannot be fetched. Please reduce the number of included studies.`}
            type="warning"
            showIcon
          />
        </div>
      );
    }

    // Show error if fetch failed
    if (error && !loading) {
      return (
        <div style={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          border: '1px solid #f0f0f0',
          borderRadius: '4px',
          padding: '8px',
          backgroundColor: '#fafafa'
        }}>
          <Alert
            message="Error fetching clinical attributes"
            description={error}
            type="error"
            showIcon
          />
        </div>
      );
    }

    // Show loading state
    if (loading) {
      return (
        <div style={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          border: '1px solid #f0f0f0',
          borderRadius: '4px',
          padding: '8px',
          backgroundColor: '#fafafa'
        }}>
          <Skeleton active loading={loading} paragraph={{ rows: 3 }} />
        </div>
      );
    }

    // Show table with attributes
    if (attributes.length > 0) {
      const columns = [
        {
          title: "Attribute",
          dataIndex: "attribute",
          key: "attribute",
          width: 200,
          sorter: (a, b) => a.attribute.localeCompare(b.attribute),
          defaultSortOrder: "ascend",
        },
        {
          title: "Count",
          dataIndex: "count",
          key: "count",
          width: 100,
          sorter: (a, b) => a.count - b.count,
          render: (count) => count.toLocaleString(),
        },
        {
          title: "%",
          dataIndex: "percentage",
          key: "percentage",
          width: 80,
          sorter: (a, b) => parseFloat(a.percentage) - parseFloat(b.percentage),
          render: (percentage) => `${percentage}%`,
        },
      ];

      return (
        <div style={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          border: '1px solid #f0f0f0',
          borderRadius: '4px',
          padding: '8px',
          backgroundColor: '#fafafa'
        }}>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px", fontWeight: 500 }}>
            Clinical Attributes
          </div>
          <div style={{ fontSize: "11px", color: "#999", marginBottom: "8px" }}>
            {totalSamples.toLocaleString()} samples
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Table
              columns={columns}
              dataSource={attributes}
              pagination={false}
              showSorterTooltip={false}
              scroll={{ x: 400, y: 300 }}
              size="small"
              bordered
            />
          </div>
        </div>
      );
    }

    // Return null if no attributes and not loading
    return null;
  }
}

ClinicalAttributesPanel.defaultProps = {
  selectedStudies: [],
  allStudies: [],
};

export default ClinicalAttributesPanel;
