import React, { useState, useEffect } from "react";
import { Modal, Space, Input, Row, Col, Form, Skeleton, Button, AutoComplete } from "antd";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import cbioportalIcon from "../../assets/images/cbioportal_icon.png";
import FilteredEventsListPanel from "../filteredEventsListPanel";
import { useCbioPortal } from "../../hooks/useCbioPortal";

const CbioportalModal = ({ visible, onCancel, loading }) => {
  const { t } = useTranslation("common");
  const report = useSelector((state) => state.CaseReport.metadata);
  const { cancerTypes, fetchCancerTypes, isLoading: hookLoading } = useCbioPortal();
  
  const [tumorDetails, setTumorDetails] = useState("");
  const [disease, setDisease] = useState("");
  const [genes, setGenes] = useState("");

  // Fetch cancer types on component mount
  useEffect(() => {
    fetchCancerTypes();
  }, [fetchCancerTypes]);

  // Update state when report changes
  useEffect(() => {
    if (report) {
      setTumorDetails(report.tumor_details || "");
      setDisease(report.disease || "");
    }
  }, [report]);

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

  const handleTumorDetailsChange = (value) => {
    setTumorDetails(value);
  };

  const handleDiseaseChange = (e) => {
    setDisease(e.target.value);
  };

  const handleGenesChange = (e) => {
    setGenes(e.target.value);
  };

  const handleClear = () => {
    setTumorDetails(report?.tumor_details || "");
    setDisease(report?.disease || "");
    setGenes("");
  };

  const handleSubmit = () => {
    console.log("cBioPortal form submitted:", {
      tumorDetails,
      disease,
      genes,
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
