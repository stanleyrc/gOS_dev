import React, { Component } from "react";
import { Modal, Space, Input, Row, Col, Form, Skeleton, Button, AutoComplete, Select, Checkbox, Alert } from "antd";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import cbioportalIcon from "../../assets/images/cbioportal_icon.png";
import FilteredEventsListPanel from "../filteredEventsListPanel";
import ClinicalAttributesPanel from "./ClinicalAttributesPanel";
import { cbioportalService } from "../../services/cbioportalService";
import { convertVariantToSingleLetterCode } from "../../helpers/utility";

class CbioportalModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tumorDetails: "",
      initialTumorDetails: "",
      genes: [],
      selectedStudies: [],
      allStudies: [],
      recommendedStudies: [],
      cancerTypes: [],
      isLoading: false,
    };
  }

  async componentDidMount() {
    this.setState({ isLoading: true });
    try {
      const [cancerTypes, studies] = await Promise.all([
        cbioportalService.getCancerTypes(),
        cbioportalService.getStudies(),
      ]);
      this.setState({
        cancerTypes: cancerTypes || [],
        allStudies: studies || [],
        isLoading: false,
      });
    } catch (error) {
      console.error("Error fetching cBioPortal data:", error);
      this.setState({ isLoading: false });
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const { report } = this.props;
    const { cancerTypes, tumorDetails, allStudies } = this.state;

    if (report !== prevProps.report || cancerTypes !== prevState.cancerTypes) {
      if (report && cancerTypes.length > 0) {
        const matchedTumorDetails = this.findClosestMatch(report.tumor_details, cancerTypes);
        const finalTumorDetails = matchedTumorDetails || report.tumor_details || "";
        this.setState({
          tumorDetails: finalTumorDetails,
          initialTumorDetails: finalTumorDetails,
        });
      } else if (report) {
        const initialValue = report.tumor_details || "";
        this.setState({
          tumorDetails: initialValue,
          initialTumorDetails: initialValue,
        });
      }
    }

    if (tumorDetails !== prevState.tumorDetails || allStudies !== prevState.allStudies) {
      const { selectedStudies, recommendedStudies } = this.getDefaults(tumorDetails);
      this.setState({ recommendedStudies, selectedStudies });
    }
  }

  findClosestMatch = (value, cancerTypesList) => {
    if (!value || cancerTypesList.length === 0) return "";
    
    const searchValue = value.toLowerCase();
    
    // Try exact match first
    const exactMatch = cancerTypesList.find(ct => 
      (ct.name || ct.id).toLowerCase() === searchValue
    );
    if (exactMatch) return exactMatch.name || exactMatch.id;
    
    // Try partial match (cancer type name contains the search value)
    const partialMatch = cancerTypesList.find(ct => 
      (ct.name || ct.id).toLowerCase().includes(searchValue)
    );
    if (partialMatch) return partialMatch.name || partialMatch.id;
    
    // Try reverse partial match (search value contains cancer type name)
    const reverseMatch = cancerTypesList.find(ct => 
      searchValue.includes((ct.name || ct.id).toLowerCase())
    );
    if (reverseMatch) return reverseMatch.name || reverseMatch.id;
    
    return "";
  };

  getCancerTypeOptions = () => {
    const { cancerTypes } = this.state;
    return cancerTypes.map((ct) => ({
      label: ct.name || ct.id,
      value: ct.name || ct.id,
    }));
  };

  getCancerTypeMap = () => {
    const { cancerTypes } = this.state;
    return cancerTypes.reduce((acc, ct) => {
      acc[ct.name || ct.cancerTypeId] = ct.cancerTypeId;
      return acc;
    }, {});
  };

  getDefaults = (tumorType) => {
    const { allStudies } = this.state;
    if (!tumorType || allStudies.length === 0) {
      return { selectedStudies: [], recommendedStudies: [] };
    }
    
    const cancerTypeMap = this.getCancerTypeMap();
    const cancerTypeId = cancerTypeMap[tumorType];
    if (!cancerTypeId) {
      return { selectedStudies: [], recommendedStudies: [] };
    }
    
    const recommendedStudies = cbioportalService.getStudiesByCancerType(cancerTypeId, allStudies);
    const selectedStudies = recommendedStudies.map(s => s.studyId);
    return { selectedStudies, recommendedStudies };
  };

  getStudiesOptions = () => {
    const { allStudies, recommendedStudies } = this.state;
    const recommendedIds = new Set(recommendedStudies.map(s => s.studyId));
    const recommended = allStudies.filter(s => recommendedIds.has(s.studyId));
    const other = allStudies.filter(s => !recommendedIds.has(s.studyId));

    const options = [];
    
    if (recommended.length > 0) {
      options.push({
        label: 'Recommended',
        options: recommended.map(study => ({
          label: `${study.name || study.studyId} (${study.allSampleCount || 0} samples)`,
          value: study.studyId,
        })),
      });
    }

    if (other.length > 0) {
      options.push({
        label: 'Other',
        options: other.map(study => ({
          label: `${study.name || study.studyId} (${study.allSampleCount || 0} samples)`,
          value: study.studyId,
        })),
      });
    }

    return options;
  };

  getTotalSampleCount = () => {
    const { allStudies, selectedStudies } = this.state;
    return allStudies
      .filter(s => selectedStudies.includes(s.studyId))
      .reduce((sum, s) => sum + (s.allSampleCount || 0), 0);
  };

  handleTumorDetailsChange = (value) => {
    this.setState({ tumorDetails: value });
  };

  handleGenesChange = (values) => {
    this.setState({ genes: values });
  };

  getGeneEntry = (record) => {
    if (!record.gene) return null;
    
    if (record.type?.toLowerCase() === 'missense' && record.variant) {
      const convertedVariant = convertVariantToSingleLetterCode(record.variant);
      return `${record.gene}:MUT=${convertedVariant}`;
    } else if (record.type) {
      return `${record.gene}:MUT=${record.type.toUpperCase()}`;
    } else {
      return record.gene;
    }
  };

  handleToggleGene = (record, checked) => {
    const { genes } = this.state;
    const geneEntry = this.getGeneEntry(record);
    
    if (!geneEntry) return;
    
    if (checked) {
      if (!genes.includes(geneEntry)) {
        this.setState({ genes: [...genes, geneEntry] });
      }
    } else {
      this.setState({ genes: genes.filter(g => g !== geneEntry) });
    }
  };

  isGeneSelected = (record) => {
    const { genes } = this.state;
    const geneEntry = this.getGeneEntry(record);
    return geneEntry ? genes.includes(geneEntry) : false;
  };

  handleStudiesChange = (values) => {
    this.setState({ selectedStudies: values });
  };

  handleSelectAllRecommended = () => {
    const { recommendedStudies } = this.state;
    const recommendedIds = recommendedStudies.map(s => s.studyId);
    this.setState({ selectedStudies: recommendedIds });
  };

  handleSelectAll = () => {
    const { allStudies } = this.state;
    const allIds = allStudies.map(s => s.studyId);
    this.setState({ selectedStudies: allIds });
  };

  handleSelectOther = () => {
    const { allStudies, recommendedStudies } = this.state;
    const recommendedIds = new Set(recommendedStudies.map(s => s.studyId));
    const otherIds = allStudies.filter(s => !recommendedIds.has(s.studyId)).map(s => s.studyId);
    this.setState({ selectedStudies: otherIds });
  };

  handleReset = () => {
    const { initialTumorDetails } = this.state;
    const { selectedStudies } = this.getDefaults(initialTumorDetails);
    
    this.setState({
      tumorDetails: initialTumorDetails,
      genes: [],
      selectedStudies,
    });
  };

  handleClear = () => {
    this.setState({
      tumorDetails: '',
      genes: [],
      selectedStudies: [],
    });
  };

  handleSubmit = () => {
    const { genes, selectedStudies } = this.state;
    
    if (!genes || genes.length === 0 || selectedStudies.length === 0) {
      console.warn("Please enter genes and select at least one study");
      return;
    }
    
    const params = new URLSearchParams({
      cancer_study_list: selectedStudies.join(','),
      gene_list: genes.join('\n'),
      Z_SCORE_THRESHOLD: '2.0',
      RPPA_SCORE_THRESHOLD: '2.0',
      profileFilter: 'mutations,structural_variants,cna',
      case_set_id: 'all',
      Action: 'Submit',
    });

    const url = `https://www.cbioportal.org/results?${params.toString()}`;
    window.open(url, '_blank');
  };

  render() {
    const { visible, onCancel, loading, t } = this.props;
    const { tumorDetails, genes, selectedStudies, isLoading } = this.state;
    const totalSampleCount = this.getTotalSampleCount();

    const selectColumn = [
      {
        title: '',
        key: 'select',
        width: 50,
        fixed: 'left',
        align: 'center',
        render: (_, record) => (
          <Checkbox
            checked={this.isGeneSelected(record)}
            onChange={(e) => this.handleToggleGene(record, e.target.checked)}
          />
        ),
      },
    ];

    return (
    <Modal
      title={
        <Space>
          <img
            src={cbioportalIcon}
            alt="cBioPortal"
            style={{
              height: "24px",
              width: "24px",
              filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))",
            }}
          />
          <span>{t("components.cbioportal-modal.title") || "cBioPortal Integration"}</span>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={1200}
      style={{ maxHeight: "90vh" }}
      styles={{ body: { maxHeight: "calc(90vh - 150px)", overflowY: "auto" } }}
    >
      <Skeleton active loading={loading || isLoading}>
        <Form layout="vertical" style={{ marginBottom: 24 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Cancer Type">
                <AutoComplete
                  value={tumorDetails}
                  options={this.getCancerTypeOptions()}
                  onChange={this.handleTumorDetailsChange}
                  placeholder="Select or enter cancer type"
                  filterOption={(inputValue, option) =>
                    option.label.toLowerCase().includes(inputValue.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Genes">
                <Select
                  mode="tags"
                  value={genes}
                  onChange={this.handleGenesChange}
                  placeholder="Select genes from table or enter manually (e.g., NF1:MUT=MISSENSE)"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={
                <Space>
                  <span>Studies</span>
                  {selectedStudies.length > 0 && (
                    <span style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
                      ({totalSampleCount.toLocaleString()} samples)
                    </span>
                  )}
                </Space>
              }>
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <Select
                    mode="multiple"
                    placeholder="Select studies"
                    options={this.getStudiesOptions()}
                    value={selectedStudies}
                    onChange={this.handleStudiesChange}
                    filterOption={(inputValue, option) => {
                      if (option.options) {
                        return option.options.some(opt =>
                          opt.label.toLowerCase().includes(inputValue.toLowerCase())
                        );
                      }
                      return option.label.toLowerCase().includes(inputValue.toLowerCase());
                    }}
                  />
                  <Space size="small">
                    <Button 
                      type="link" 
                      size="small" 
                      onClick={this.handleSelectAll}
                      style={{ padding: 0, height: 'auto' }}
                    >
                      Select All
                    </Button>
                    {this.state.recommendedStudies.length > 0 && (
                      <Button 
                        type="link" 
                        size="small" 
                        onClick={this.handleSelectAllRecommended}
                        style={{ padding: 0, height: 'auto' }}
                      >
                        Select Recommended
                      </Button>
                    )}
                    <Button 
                      type="link" 
                      size="small" 
                      onClick={this.handleSelectOther}
                      style={{ padding: 0, height: 'auto' }}
                    >
                      Select Other
                    </Button>
                    <Button 
                      type="link" 
                      size="small" 
                      onClick={() => this.setState({ selectedStudies: [] })}
                      style={{ padding: 0, height: 'auto' }}
                    >
                      Clear
                    </Button>
                  </Space>
                </Space>
              </Form.Item>
            </Col>
            <Col span={12}>
              <div style={{ height: '100%', minHeight: 'auto' }}>
                <ClinicalAttributesPanel 
                  selectedStudies={selectedStudies}
                  allStudies={this.state.allStudies}
                />
              </div>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24} style={{ textAlign: "right" }}>
              <Space>
                <Button onClick={this.handleClear}>
                  Clear All
                </Button>
                <Button onClick={this.handleReset}>
                  Reset to Defaults
                </Button>
                <Button type="primary" onClick={this.handleSubmit}>
                  Submit
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>

        <FilteredEventsListPanel additionalColumns={selectColumn} />
      </Skeleton>
    </Modal>
    );
  }
}

const mapStateToProps = (state) => ({
  report: state.CaseReport.metadata,
});

export default connect(mapStateToProps)(withTranslation("common")(CbioportalModal));
