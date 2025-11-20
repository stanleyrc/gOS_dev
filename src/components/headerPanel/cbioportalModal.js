import React, { Component } from "react";
import { Modal, Space, Input, Row, Col, Form, Skeleton, Button, AutoComplete, Select } from "antd";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import cbioportalIcon from "../../assets/images/cbioportal_icon.png";
import FilteredEventsListPanel from "../filteredEventsListPanel";
import { cbioportalService } from "../../services/cbioportalService";

class CbioportalModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tumorDetails: "",
      initialTumorDetails: "",
      disease: "",
      genes: "",
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
          disease: report.disease || "",
        });
      } else if (report) {
        const initialValue = report.tumor_details || "";
        this.setState({
          tumorDetails: initialValue,
          initialTumorDetails: initialValue,
          disease: report.disease || "",
        });
      }
    }

    if (tumorDetails !== prevState.tumorDetails || allStudies !== prevState.allStudies) {
      if (tumorDetails && allStudies.length > 0) {
        const cancerTypeMap = this.getCancerTypeMap();
        const cancerTypeId = cancerTypeMap[tumorDetails];
        if (cancerTypeId) {
          const filtered = cbioportalService.getStudiesByCancerType(cancerTypeId, allStudies);
          this.setState({ recommendedStudies: filtered });
        }
      } else {
        this.setState({ recommendedStudies: [], selectedStudies: [] });
      }
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
          label: study.name || study.studyId,
          value: study.studyId,
        })),
      });
    }

    if (other.length > 0) {
      options.push({
        label: 'Other',
        options: other.map(study => ({
          label: study.name || study.studyId,
          value: study.studyId,
        })),
      });
    }

    return options;
  };

  handleTumorDetailsChange = (value) => {
    this.setState({ tumorDetails: value });
  };

  handleDiseaseChange = (e) => {
    this.setState({ disease: e.target.value });
  };

  handleGenesChange = (e) => {
    this.setState({ genes: e.target.value });
  };

  handleStudiesChange = (values) => {
    this.setState({ selectedStudies: values });
  };

  handleClear = () => {
    const { report } = this.props;
    const { initialTumorDetails } = this.state;
    this.setState({
      tumorDetails: initialTumorDetails,
      disease: report?.disease || "",
      genes: "",
      selectedStudies: [],
    });
  };

  handleSubmit = () => {
    const { tumorDetails, disease, genes, selectedStudies } = this.state;
    console.log("cBioPortal form submitted:", {
      tumorDetails,
      disease,
      genes,
      selectedStudies,
    });
  };

  render() {
    const { visible, onCancel, loading, t } = this.props;
    const { tumorDetails, disease, genes, selectedStudies, isLoading } = this.state;

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
      bodyStyle={{ maxHeight: "calc(90vh - 150px)", overflowY: "auto" }}
    >
      <Skeleton active loading={loading || isLoading}>
        <Form layout="vertical" style={{ marginBottom: 24 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Tumor Details">
                <AutoComplete
                  value={tumorDetails}
                  options={this.getCancerTypeOptions()}
                  onChange={this.handleTumorDetailsChange}
                  placeholder="Select or enter tumor details"
                  filterOption={(inputValue, option) =>
                    option.label.toLowerCase().includes(inputValue.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Disease">
                <Input
                  value={disease}
                  onChange={this.handleDiseaseChange}
                  placeholder="Enter disease"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Studies">
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
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Genes">
                <Input
                  value={genes}
                  onChange={this.handleGenesChange}
                  placeholder="Enter genes (comma separated)"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24} style={{ textAlign: "right" }}>
              <Space>
                <Button onClick={this.handleClear}>
                  Clear
                </Button>
                <Button type="primary" onClick={this.handleSubmit}>
                  Submit
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>

        <FilteredEventsListPanel />
      </Skeleton>
    </Modal>
    );
  }
}

const mapStateToProps = (state) => ({
  report: state.CaseReport.metadata,
});

export default connect(mapStateToProps)(withTranslation("common")(CbioportalModal));
