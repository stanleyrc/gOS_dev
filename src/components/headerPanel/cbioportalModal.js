import React, { useState, useEffect } from "react";
import { Modal, Space, Input, Row, Col, Form, Skeleton, Button, AutoComplete, Select } from "antd";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import cbioportalIcon from "../../assets/images/cbioportal_icon.png";
import FilteredEventsListPanel from "../filteredEventsListPanel";
import { useCbioPortal } from "../../hooks/useCbioPortal";

const CbioportalModal = ({ visible, onCancel, loading }) => {
  const { t } = useTranslation("common");
  const report = useSelector((state) => state.CaseReport.metadata);
  const { 
    cancerTypes, 
    fetchCancerTypes, 
    fetchStudies, 
    fetchStudiesByCancerType,
    isLoading: hookLoading 
  } = useCbioPortal();
  
  const [tumorDetails, setTumorDetails] = useState("");
  const [disease, setDisease] = useState("");
  const [genes, setGenes] = useState("");
  const [selectedStudies, setSelectedStudies] = useState([]);
  const [allStudies, setAllStudies] = useState([]);
  const [recommendedStudies, setRecommendedStudies] = useState([]);

  // Fetch cancer types and all studies on component mount
  useEffect(() => {
    fetchCancerTypes();
    fetchStudies().then(data => setAllStudies(data || []));
  }, [fetchCancerTypes, fetchStudies]);

  // Update state when report changes
  useEffect(() => {
    if (report) {
      setTumorDetails(report.tumor_details || "");
      setDisease(report.disease || "");
    }
  }, [report]);

  // Fetch recommended studies when tumor details changes
  useEffect(() => {
    if (tumorDetails) {
      const cancerTypeId = cancerTypeMap[tumorDetails];
      if (cancerTypeId) {
        fetchStudiesByCancerType(cancerTypeId).then(data => 
          setRecommendedStudies(data || [])
        );
      }
    } else {
      setRecommendedStudies([]);
      setSelectedStudies([]);
    }
  }, [tumorDetails]);

  // Convert cancer types to AutoComplete options
  const cancerTypeOptions = cancerTypes.map((ct) => ({
    label: ct.name || ct.id,
    value: ct.name || ct.id,
  }));

  // Create a map for looking up cancer type ID by name
  const cancerTypeMap = cancerTypes.reduce((acc, ct) => {
    acc[ct.name || ct.id] = ct.id;
    return acc;
  }, {});

  // Create studies options grouped by recommended and other
  const getStudiesOptions = () => {
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

  const handleTumorDetailsChange = (value) => {
    setTumorDetails(value);
  };

  const handleDiseaseChange = (e) => {
    setDisease(e.target.value);
  };

  const handleGenesChange = (e) => {
    setGenes(e.target.value);
  };

  const handleStudiesChange = (values) => {
    setSelectedStudies(values);
  };

  const handleClear = () => {
    setTumorDetails(report?.tumor_details || "");
    setDisease(report?.disease || "");
    setGenes("");
    setSelectedStudies([]);
  };

  const handleSubmit = () => {
    console.log("cBioPortal form submitted:", {
      tumorDetails,
      disease,
      genes,
      selectedStudies,
    });
  };

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
      <Skeleton active loading={loading || hookLoading}>
        <Form layout="vertical" style={{ marginBottom: 24 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Tumor Details">
                <AutoComplete
                  value={tumorDetails}
                  options={cancerTypeOptions}
                  onChange={handleTumorDetailsChange}
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
                  onChange={handleDiseaseChange}
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
                  options={getStudiesOptions()}
                  value={selectedStudies}
                  onChange={handleStudiesChange}
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
                  onChange={handleGenesChange}
                  placeholder="Enter genes (comma separated)"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24} style={{ textAlign: "right" }}>
              <Space>
                <Button onClick={handleClear}>
                  Clear
                </Button>
                <Button type="primary" onClick={handleSubmit}>
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
};

export default CbioportalModal;
