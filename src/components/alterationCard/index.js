import React, { Component } from "react";
import { connect } from "react-redux";
import { BsDashLg } from "react-icons/bs";
import { Card, Tag, Typography, Descriptions, Avatar } from "antd";
import Wrapper from "./index.style";
import { tierColor } from "../../helpers/utility";
import interpretationsActions from "../../redux/interpretations/actions";
import EditableTextBlock from "../editableTextBlock";
import EditablePillsBlock from "../editablePillsBlock";
import { withTranslation } from "react-i18next";
import EventInterpretation from "../../helpers/EventInterpretation";

const { Title, Text } = Typography;

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String).map((s) => s.trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

class AlterationCard extends Component {
  updateFields = (changes) => {
    const { record, caseId } = this.props;
    
    const eventInterpretation = new EventInterpretation({
      caseId: caseId || record?.id || "UNKNOWN",
      alterationId: record?.uid || "UNKNOWN",
      gene: record?.gene,
      variant: record?.variant,
      data: changes
    });
    
    const payload = eventInterpretation.toJSON();
    
    this.props.dispatch(
      interpretationsActions.updateInterpretation(payload)
    );
  }

  render() {
    const { t, record } = this.props;
    
    if (!record) {
      return (
        <Wrapper>
          <Card className="variant-card">
            <Text type="secondary">{t("components.alteration-card.no-alteration")}</Text>
          </Card>
        </Wrapper>
      );
    }

    const {
      tier,
      gene,
      variant,
      role,
      effect,
      vaf,
      estimatedAlteredCopies,
      altCounts,
      refCounts,
      gene_summary,
      variant_summary,
      effect_description,
      therapeutics,
      resistances,
      notes,
    } = record;

    const currentTierStr = ["1", "2", "3"].includes(String(tier))
      ? String(tier)
      : "3";
    const geneLabel = (gene || t("components.alteration-card.unknown")).replace("::", "-");
    const variantTitle = variant || "";

    const roles = toList(role);

    const hasMetrics =
      vaf !== undefined ||
      estimatedAlteredCopies !== undefined ||
      altCounts !== undefined ||
      refCounts !== undefined;

    const unavailableMetric = (<Text italic disabled> <BsDashLg /> </Text>);

    return (
      <Wrapper>
        <Card className="variant-card" bordered>
          <div className="variant-header">
            <div className="gene-left">
              {currentTierStr && (
                <div className="tier-control" title={`${t("components.filtered-events-panel.tier")} ${currentTierStr}`}>
                  <Avatar
                    size={32}
                    style={{
                      backgroundColor: tierColor(+currentTierStr) || "#6c757d",
                      color: "#fff",
                      fontWeight: 700,
                    }}
                  >
                    {currentTierStr}
                  </Avatar>
                  <select
                    className="tier-select"
                    value={currentTierStr}
                    onChange={(e) => {
                      this.updateFields({ tier: e.target.value });
                    }}
                    aria-label={t("components.alteration-card.tier-select.label", { gene: geneLabel, variant: variantTitle })}
                  >
                    <option value="1">{t("components.alteration-card.tier-select.options.1")}</option>
                    <option value="2">{t("components.alteration-card.tier-select.options.2")}</option>
                    <option value="3">{t("components.alteration-card.tier-select.options.3")}</option>
                  </select>
                </div>
              )}
              <div>
                <Title level={4} className="gene-title" style={{ marginBottom: 0 }}>
                  {geneLabel}
                </Title>
                {variantTitle ? (
                  <div className="variant-title">{variantTitle}</div>
                ) : null}
              </div>
            </div>
            <div className="gene-right">
              {roles.map((r) => (
                <Tag key={`role-${r}`} className="pill role-pill">
                  {r}
                </Tag>
              ))}
              {effect ? (
                <Tag className="pill effect-pill">{effect}</Tag>
              ) : null}
            </div>
          </div>

          <div className="variant-body">
            <div className="variant-desc">
              <EditableTextBlock
                title={t("components.alteration-card.labels.gene-summary")}
                value={gene_summary || ""}
                onChange={(v) => this.updateFields({ gene_summary: v })}
               />
              <EditableTextBlock
                title={t("components.alteration-card.labels.variant-summary")}
                value={variant_summary || ""}
                onChange={(v) => this.updateFields({ variant_summary: v })}
               />
              <EditableTextBlock
                title={t("components.alteration-card.labels.effect-description")}
                value={effect_description || ""}
                onChange={(v) => this.updateFields({ effect_description: v })}
               />
              <EditableTextBlock
                title={t("components.alteration-card.labels.notes")}
                value={notes || ""}
                onChange={(v) => this.updateFields({ notes: v })}
               />
            </div>

            {hasMetrics ? (
              <div className="metrics-block">
                <Descriptions size="small" bordered column={1}>
                  <Descriptions.Item label={t("components.alteration-card.labels.vaf")}>
                    {vaf !== undefined ? <span className="monospace">{String(vaf)}</span> : unavailableMetric}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("components.alteration-card.labels.multiplicity")}>
                    {estimatedAlteredCopies !== undefined ? (
                      <span className="monospace">{String(estimatedAlteredCopies)}</span>
                    ) : (
                      unavailableMetric
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("components.alteration-card.labels.tumor-alt")}>
                    {altCounts !== undefined ? <span className="monospace">{String(altCounts)}</span> : unavailableMetric}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("components.alteration-card.labels.tumor-ref")}>
                    {refCounts !== undefined ? <span className="monospace">{String(refCounts)}</span> : unavailableMetric}
                  </Descriptions.Item>
                </Descriptions>
              </div>
            ) : null}
          </div>


          <div className="variant-footer">
            <EditablePillsBlock
              title={t("components.alteration-card.labels.therapeutics")}
              list={toList(therapeutics)}
              onChange={(arr) => this.updateFields({ therapeutics: arr })}
              pillClass="therapeutic-tag"
            />

            <EditablePillsBlock
              title={t("components.alteration-card.labels.resistances")}
              list={toList(resistances)}
              onChange={(arr) => this.updateFields({ resistances: arr })}
              pillClass="resistance-tag"
            />

          </div>
        </Card>
      </Wrapper>
    );
  }
}

const mapStateToProps = (state) => ({
  caseId: state?.CaseReport?.id,
});

export default connect(mapStateToProps)(withTranslation("common")(AlterationCard));
