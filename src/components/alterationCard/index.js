import React, { Component } from "react";
import { connect } from "react-redux";
import { BsDashLg } from "react-icons/bs";
import { Card, Tag, Typography, Descriptions, Avatar, Button } from "antd";
import Wrapper from "./index.style";
import { tierColor, getTimeAgo } from "../../helpers/utility";
import interpretationsActions from "../../redux/interpretations/actions";
import EditableTextBlock from "../editableTextBlock";
import EditablePillsBlock from "../editablePillsBlock";
import { withTranslation } from "react-i18next";
import EventInterpretation from "../../helpers/EventInterpretation";

import InterpretationVersionsSidepanel from "../InterpretationVersionsSidepanel";
import { getInterpretationForAlteration, getAllInterpretationsForAlteration, getAllInterpretationsForGene, getBaseEvent } from "../../redux/interpretations/selectors";

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
  state = {
    showVersions: false,
    selectedInterpretation: null, // When set, overrides the current one
  };



  updateFields = async (changes) => {
    const { record, caseId } = this.props;
    const currentData = this.props.interpretation?.data || {};
    const data = { ...currentData, ...changes };

    // Ensure user exists before creating interpretation
    const { ensureUser } = await import("../../helpers/userAuth");
    try {
      await ensureUser();
    } catch (error) {
      // User cancelled sign-in
      return;
    }

    const eventInterpretation = new EventInterpretation({
      caseId: caseId || record?.id || "UNKNOWN",
      alterationId: record?.uid || "UNKNOWN",
      gene: record?.gene,
      variant: record?.variant,
      data
    });

    const payload = eventInterpretation.toJSON();

    this.props.dispatch(
      interpretationsActions.updateInterpretation(payload)
    );
  };

  handleShowVersions = () => {
    this.setState({ showVersions: true });
  };

  handleCloseVersions = () => {
    this.setState({ showVersions: false });
  };

  handleSelectInterpretation = (interpretation) => {
    this.setState({ selectedInterpretation: interpretation, showVersions: false });
  };

  handleClearSelection = () => {
    this.setState({ selectedInterpretation: null });
  };

  handleCopyVersion = async () => {
    const confirmed = window.confirm("Are you sure you want to overwrite your version with this one?");
    if (!confirmed) return;

    const { selectedInterpretation } = this.state;
    const { caseId, record } = this.props;
    const data = selectedInterpretation?.data || {};

    // Ensure user exists before creating interpretation
    const { ensureUser } = await import("../../helpers/userAuth");
    try {
      await ensureUser();
    } catch (error) {
      // User cancelled sign-in
      return;
    }

    const eventInterpretation = new EventInterpretation({
      caseId,
      alterationId: record?.uid,
      gene: record?.gene,
      variant: record?.variant,
      data
    });

    this.props.dispatch(interpretationsActions.updateInterpretation(eventInterpretation.toJSON()));
    this.setState({ selectedInterpretation: null });
  };

  componentDidUpdate(prevProps, prevState) {
    // Reset editing state when switching interpretations
    if (prevState.selectedInterpretation !== this.state.selectedInterpretation) {
      // EditableTextBlock handles its own reset via props.value change
    }
  }

  render() {
    const { t, record, interpretation, allInterpretations, baseRecord } = this.props;
    const { showVersions, selectedInterpretation } = this.state;
    
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

    // Determine which interpretation to display
    const displayInterpretation = selectedInterpretation || interpretation;
    // Base defaults for editable fields when not present in interpretation
    const baseDefaults = {
      tier: baseRecord?.tier || 3, // base tier from original event
      gene_summary: baseRecord?.gene_summary || "",
      variant_summary: baseRecord?.variant_summary || "",
      effect_description: baseRecord?.effect_description || "",
      notes: baseRecord?.notes || "",
      therapeutics: baseRecord?.therapeutics || [],
      resistances: baseRecord?.resistances || [],
    };
    const displayData = { ...record, ...baseDefaults, ...displayInterpretation?.data };

    const currentTierStr = ["1", "2", "3"].includes(String(displayData.tier))
      ? String(displayData.tier)
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

    // Check if current user is viewing their own interpretation
    const isCurrentUser = !selectedInterpretation || displayInterpretation?.isCurrentUser;

    // Format author and date for watermark button
    const authorName = displayInterpretation?.authorName || 'Switch Version';
    const lastModified = displayInterpretation?.lastModified;
    const dateStr = lastModified ? getTimeAgo(new Date(lastModified)) : '';
    const watermarkText = authorName === 'Switch Version' ? authorName : `last modified by ${authorName} ${dateStr}`;

    return (
      <Wrapper>
        <Card className="variant-card" bordered bodyStyle={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0px', marginBottom: '16px' }}>
            {!isCurrentUser && (
              <Button
                type="primary"
                size="small"
                onClick={this.handleCopyVersion}
                style={{ fontSize: '12px', height: 'auto', lineHeight: '1', marginRight: '8px' }}
              >
                Copy to My Version
              </Button>
            )}
            <Button
              type="text"
              size="small"
              onClick={this.handleShowVersions}
              style={{
                fontSize: '12px',
                color: '#999',
                border: 'none',
                padding: '2px 8px',
                height: 'auto',
                lineHeight: '1',
              }}
            >
              {watermarkText}
            </Button>
          </div>
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
                    disabled={!isCurrentUser}
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
                value={displayData.gene_summary || ""}
                onChange={(v) => this.updateFields({ gene_summary: v })}
                readOnly={!isCurrentUser}
               />
              <EditableTextBlock
                title={t("components.alteration-card.labels.variant-summary")}
                value={displayData.variant_summary || ""}
                onChange={(v) => this.updateFields({ variant_summary: v })}
                readOnly={!isCurrentUser}
               />
              <EditableTextBlock
                title={t("components.alteration-card.labels.effect-description")}
                value={displayData.effect_description || ""}
                onChange={(v) => this.updateFields({ effect_description: v })}
                readOnly={!isCurrentUser}
               />
              <EditableTextBlock
                title={t("components.alteration-card.labels.notes")}
                value={displayData.notes || ""}
                onChange={(v) => this.updateFields({ notes: v })}
                readOnly={!isCurrentUser}
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
              list={toList(displayData.therapeutics)}
              onChange={(arr) => this.updateFields({ therapeutics: arr })}
              pillClass="therapeutic-tag"
              readOnly={!isCurrentUser}
            />

            <EditablePillsBlock
              title={t("components.alteration-card.labels.resistances")}
              list={toList(displayData.resistances)}
              onChange={(arr) => this.updateFields({ resistances: arr })}
              pillClass="resistance-tag"
              readOnly={!isCurrentUser}
            />

          </div>
        </Card>

        <InterpretationVersionsSidepanel
          tableData={allInterpretations}
          title="Event Versions"
          isOpen={showVersions}
          onClose={this.handleCloseVersions}
          onSelect={this.handleSelectInterpretation}
          additionalColumns={[
            {
              title: 'Case ID',
              dataIndex: 'caseId',
              key: 'caseId',
            },
            {
              title: 'Gene',
              dataIndex: 'gene',
              key: 'gene',
            },
            {
              title: 'Variant',
              dataIndex: 'variant',
              key: 'variant',
            },
          ]}
        />
      </Wrapper>
    );
  }
}

const mapStateToProps = (state, ownProps) => ({
  caseId: state?.CaseReport?.id,
  interpretation: getInterpretationForAlteration(state, ownProps.record?.uid),
  allInterpretations: getAllInterpretationsForGene(state, ownProps.record?.gene),
  baseRecord: getBaseEvent(state, ownProps.record?.uid),
});

export default connect(mapStateToProps)(withTranslation("common")(AlterationCard));
