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

  componentDidUpdate(prevProps) {
    const { selectedStudies } = this.props;
    
    // Trigger fetch when selected studies change
    if (selectedStudies !== prevProps.selectedStudies) {
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
    // Assuming counts is an object with attribute data
    // Transform it into array format for the table
    if (!counts || typeof counts !== 'object') {
      return [];
    }

    return Object.entries(counts).map(([key, value], index) => ({
      id: key,
      key: `${key}-${index}`,
      attribute: key,
      count: value,
      percentage: totalSamples > 0 ? ((value / totalSamples) * 100).toFixed(2) : 0,
    }));
  };

  render() {
    const { loading, attributes, error, exceedsThreshold, totalSamples } = this.state;
    const { selectedStudies } = this.props;

    // Don't render anything if no studies selected
    if (!selectedStudies || selectedStudies.length === 0) {
      return null;
    }

    // Show warning if exceeds threshold
    if (exceedsThreshold) {
      return (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <Alert
              message="Too many samples selected"
              description={`The selected studies contain ${totalSamples.toLocaleString()} samples (more than ${SAMPLE_THRESHOLD.toLocaleString()} limit). Clinical attribute data cannot be fetched for this many samples. Please reduce the number of included studies.`}
              type="warning"
              showIcon
              closable
            />
          </Col>
        </Row>
      );
    }

    // Show error if fetch failed
    if (error && !loading) {
      return (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <Alert
              message="Error fetching clinical attributes"
              description={error}
              type="error"
              showIcon
              closable
            />
          </Col>
        </Row>
      );
    }

    // Show loading state
    if (loading) {
      return (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <Skeleton active loading={loading} paragraph={{ rows: 4 }} />
          </Col>
        </Row>
      );
    }

    // Show table with attributes
    if (attributes.length > 0) {
      const columns = [
        {
          title: "Attribute",
          dataIndex: "attribute",
          key: "attribute",
          width: "40%",
          sorter: (a, b) => a.attribute.localeCompare(b.attribute),
        },
        {
          title: "Sample Count",
          dataIndex: "count",
          key: "count",
          width: "30%",
          sorter: (a, b) => a.count - b.count,
          render: (count) => count.toLocaleString(),
        },
        {
          title: "Percentage",
          dataIndex: "percentage",
          key: "percentage",
          width: "30%",
          sorter: (a, b) => parseFloat(a.percentage) - parseFloat(b.percentage),
          render: (percentage) => `${percentage}%`,
        },
      ];

      return (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <h3>Clinical Attributes</h3>
            <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
              Based on {totalSamples.toLocaleString()} samples across selected studies
            </div>
            <Table
              columns={columns}
              dataSource={attributes}
              pagination={{ pageSize: 20 }}
              showSorterTooltip={false}
              scroll={{ x: "100%" }}
              size="small"
            />
          </Col>
        </Row>
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
