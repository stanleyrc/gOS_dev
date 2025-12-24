import React, { Component } from "react";
import { Card, Tabs, Tag, Space, Typography, Divider, Button } from "antd";
import { CloseOutlined, LinkOutlined } from "@ant-design/icons";
import { TREATMENT_COLORS, SOC_CLASSES } from "./constants";

const { Text, Link } = Typography;

class TrialDetailsPanel extends Component {
  isStandardOfCare = (treatmentClass) => SOC_CLASSES.includes(treatmentClass);

  renderBoxPlot = (outcome, scaleMin, scaleMax, treatmentClass) => {
    const color = TREATMENT_COLORS[treatmentClass] || TREATMENT_COLORS["OTHER"];
    const scaleRange = scaleMax - scaleMin || 1;
    const valueToPercent = (val) => ((val - scaleMin) / scaleRange) * 100;

    const hasCI = outcome.ci_lower != null && outcome.ci_upper != null;
    const valuePos = valueToPercent(outcome.value);
    const lowerPos = hasCI ? valueToPercent(outcome.ci_lower) : valuePos;
    const upperPos = hasCI ? valueToPercent(outcome.ci_upper) : valuePos;

    return (
      <div style={{ minWidth: 200 }}>
        <div style={{ position: "relative", height: 20, background: "#f0f0f0", borderRadius: 3 }}>
          {/* Whisker bar */}
          {hasCI && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                transform: "translateY(-50%)",
                left: `${lowerPos}%`,
                width: `${Math.max(0, upperPos - lowerPos)}%`,
                height: 4,
                background: color,
                opacity: 0.6,
                borderRadius: 2,
              }}
            />
          )}
          {/* Lower cap */}
          {hasCI && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                transform: "translate(-50%, -50%)",
                left: `${lowerPos}%`,
                width: 2,
                height: 14,
                background: color,
                borderRadius: 1,
              }}
            />
          )}
          {/* Upper cap */}
          {hasCI && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                transform: "translate(-50%, -50%)",
                left: `${upperPos}%`,
                width: 2,
                height: 14,
                background: color,
                borderRadius: 1,
              }}
            />
          )}
          {/* Central point */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              transform: "translate(-50%, -50%)",
              left: `${valuePos}%`,
              width: 12,
              height: 12,
              background: color,
              borderRadius: "50%",
              border: "2px solid white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "#888",
            marginTop: 2,
          }}
        >
          <span>{scaleMin.toFixed(1)}</span>
          <span>{scaleMax.toFixed(1)}</span>
        </div>
      </div>
    );
  };

  renderOutcomeTable = (outcomeType) => {
    const { trial, clickedOutcome } = this.props;
    const outcomes = trial.outcomes?.filter((o) => o.outcome_type === outcomeType) || [];
    if (outcomes.length === 0) return <Text type="secondary">No {outcomeType} data</Text>;

    // Calculate scale bounds
    const allValues = outcomes.flatMap((o) =>
      [o.ci_lower, o.value, o.ci_upper].filter((v) => v != null)
    );
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;
    const padding = range * 0.1;
    const scaleMin = Math.max(0, minVal - padding);
    const scaleMax = maxVal + padding;

    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f5f5f5", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: 8, textAlign: "left" }}>Arm Name</th>
            <th style={{ padding: 8, textAlign: "left" }}>Treatment Class</th>
            <th style={{ padding: 8, textAlign: "left" }}>Value</th>
            <th style={{ padding: 8, textAlign: "left", minWidth: 220 }}>Visualization</th>
          </tr>
        </thead>
        <tbody>
          {outcomes.map((outcome, i) => {
            const treatmentClass = trial.treatment_class_map?.[outcome.arm_title] || "OTHER";
            const isHighlighted = outcome.arm_title === clickedOutcome?.arm_title;
            return (
              <tr
                key={i}
                style={{
                  borderBottom: "1px solid #eee",
                  backgroundColor: isHighlighted ? "#e8f4fd" : "transparent",
                  borderLeft: isHighlighted ? "3px solid #0066cc" : "3px solid transparent",
                }}
              >
                <td style={{ padding: 8 }}>
                  <Text strong>{outcome.arm_title}</Text>
                  {this.isStandardOfCare(treatmentClass) && (
                    <Text type="secondary"> (SoC)</Text>
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  <Tag color={TREATMENT_COLORS[treatmentClass] ? undefined : "default"}
                    style={{ backgroundColor: TREATMENT_COLORS[treatmentClass], color: "#fff", border: "none" }}>
                    {treatmentClass}
                  </Tag>
                </td>
                <td style={{ padding: 8 }}>
                  <Text>
                    {outcome.value?.toFixed?.(1) || outcome.value} {outcome.unit || "mo"}
                  </Text>
                  {outcome.ci_lower != null && outcome.ci_upper != null && (
                    <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                      CI: [{outcome.ci_lower?.toFixed?.(1)}, {outcome.ci_upper?.toFixed?.(1)}]
                    </Text>
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  {this.renderBoxPlot(outcome, scaleMin, scaleMax, treatmentClass)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  render() {
    const { trial, onClose } = this.props;
    if (!trial) return null;

    const outcomeTypes = ["PFS", "OS", "ORR"].filter((type) =>
      trial.outcomes?.some((o) => o.outcome_type === type)
    );

    return (
      <Card
        title={
          <Space>
            <Text strong style={{ maxWidth: 600, display: "inline-block" }}>
              {trial.brief_title}
            </Text>
          </Space>
        }
        extra={
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
        }
        style={{ marginTop: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
        styles={{ body: { padding: 16 } }}
      >
        {/* Trial Info Section */}
        <Space wrap style={{ marginBottom: 16 }}>
          <Link href={trial.url} target="_blank">
            <LinkOutlined /> {trial.nct_id}
          </Link>
          <Tag color="blue">{trial.status}</Tag>
          <Tag color="purple">{trial.phase}</Tag>
          <Text>Sponsor: {trial.sponsor}</Text>
          {trial.line_of_therapy && <Tag color="green">{trial.line_of_therapy}</Tag>}
        </Space>

        <Divider style={{ margin: "12px 0" }} />

        {/* Timeline */}
        <Space style={{ marginBottom: 16 }}>
          <Text>
            <Text strong>Start:</Text> {this.formatDate(trial.start_date)}
          </Text>
          <Text>
            <Text strong>Completion:</Text> {this.formatDate(trial.completion_date)}
          </Text>
        </Space>

        <Divider style={{ margin: "12px 0" }} />

        {/* Disease & Biomarkers */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: "block", marginBottom: 8 }}>Disease & Eligibility</Text>
          <Space wrap>
            {trial.cancer_types?.map((t) => (
              <Tag key={t} color="pink">
                {t}
              </Tag>
            ))}
            {trial.cancer_stages?.map((s) => (
              <Tag key={s} color="orange">
                {s}
              </Tag>
            ))}
            {trial.biomarkers?.map((b, i) => (
              <Tag
                key={i}
                color={
                  b.status === "POSITIVE"
                    ? "green"
                    : b.status === "NEGATIVE"
                    ? "red"
                    : "default"
                }
              >
                {b.target}
                {b.status === "POSITIVE" ? "+" : b.status === "NEGATIVE" ? "-" : ""}
              </Tag>
            ))}
          </Space>
          {(trial.prior_tki || trial.prior_io || trial.prior_platinum) && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">Prior Treatment: </Text>
              {trial.prior_tki && <Tag>Prior TKI</Tag>}
              {trial.prior_io && <Tag>Prior IO</Tag>}
              {trial.prior_platinum && <Tag>Prior Platinum</Tag>}
            </div>
          )}
        </div>

        <Divider style={{ margin: "12px 0" }} />

        {/* Treatment Arms */}
        {trial.arm_drugs && Object.keys(trial.arm_drugs).length > 0 && (
          <>
            <Text strong style={{ display: "block", marginBottom: 8 }}>Treatment Arms</Text>
            <Space wrap style={{ marginBottom: 16 }}>
              {Object.entries(trial.arm_drugs).map(([armName, drugs]) => {
                const treatmentClass = trial.treatment_class_map?.[armName] || "OTHER";
                const color = TREATMENT_COLORS[treatmentClass] || "#7F8C8D";
                return (
                  <Card
                    key={armName}
                    size="small"
                    style={{
                      borderLeft: `4px solid ${color}`,
                      minWidth: 180,
                    }}
                    styles={{ body: { padding: 8 } }}
                  >
                    <Text strong>{armName}</Text>
                    <br />
                    <Tag
                      style={{
                        backgroundColor: color,
                        color: "#fff",
                        border: "none",
                        marginTop: 4,
                      }}
                    >
                      {treatmentClass}
                    </Tag>
                    <br />
                    <Text style={{ fontSize: 12, color: "#666" }}>
                      {Array.isArray(drugs) ? drugs.join(", ") : drugs}
                    </Text>
                  </Card>
                );
              })}
            </Space>
            <Divider style={{ margin: "12px 0" }} />
          </>
        )}

        {/* Outcomes with Box-Whisker */}
        {outcomeTypes.length > 0 && (
          <>
            <Text strong style={{ display: "block", marginBottom: 8 }}>Outcomes</Text>
            <Tabs
              items={outcomeTypes.map((type) => ({
                key: type,
                label: type,
                children: this.renderOutcomeTable(type),
              }))}
            />
          </>
        )}
      </Card>
    );
  }
}

export default TrialDetailsPanel;
