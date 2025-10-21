import React, { Component } from "react";
import { connect } from "react-redux";
import { BsDashLg } from "react-icons/bs";
import { Card, Tag, Typography, Descriptions, Avatar } from "antd";
import Wrapper from "./index.style";
import { tierColor } from "../../helpers/utility";
import filteredEventsActions from "../../redux/filteredEvents/actions";
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
  constructor(props) {
    super(props);
    
    const liveRecord = this.getLiveRecord();
    const {
      gene_summary,
      variant_summary,
      effect_description,
      therapeutics,
      resistances,
    } = liveRecord || {};

    const therapeuticsList = toList(therapeutics);
    const resistancesList = toList(resistances);

    this.state = {
      geneSummary: gene_summary || "",
      variantSummary: variant_summary || "",
      effectDescription: effect_description || "",
      therapeutics: therapeuticsList,
      resistances: resistancesList,
      notes: (liveRecord && liveRecord.notes) || "",
    };
  }

  getLiveRecord() {
    const { record, filteredEvents } = this.props;
    const fe = filteredEvents;
    if (!fe) return record;
    if (record?.uid && fe.selectedFilteredEvent?.uid === record.uid) {
      return fe.selectedFilteredEvent;
    }
    const fromList = (fe.filteredEvents || []).find((d) => d?.uid === record?.uid);
    return fromList || record;
  }

  componentDidUpdate(prevProps) {
    const liveRecord = this.getLiveRecord();
    const prevLiveRecord = this.getLiveRecordFromProps(prevProps);

    if (!liveRecord) return;

    const {
      gene_summary,
      variant_summary,
      effect_description,
      therapeutics,
      resistances,
    } = liveRecord;

    const prevRecord = prevLiveRecord || {};
    const therapeuticsList = toList(therapeutics);
    const resistancesList = toList(resistances);
    const prevTherapeuticsList = toList(prevRecord.therapeutics);
    const prevResistancesList = toList(prevRecord.resistances);

    if (
      gene_summary !== prevRecord.gene_summary ||
      variant_summary !== prevRecord.variant_summary ||
      effect_description !== prevRecord.effect_description ||
      therapeuticsList.join("|") !== prevTherapeuticsList.join("|") ||
      resistancesList.join("|") !== prevResistancesList.join("|") ||
      liveRecord.notes !== prevRecord.notes
    ) {
      this.setState({
        geneSummary: gene_summary || "",
        variantSummary: variant_summary || "",
        effectDescription: effect_description || "",
        therapeutics: therapeuticsList,
        resistances: resistancesList,
        notes: (liveRecord && liveRecord.notes) || "",
      });
    }
  }

  getLiveRecordFromProps(props) {
    const { record, filteredEvents } = props;
    const fe = filteredEvents;
    console.log(filteredEvents)
    if (!fe) return record;
    if (record?.uid && fe.selectedFilteredEvent?.uid === record.uid) {
      return fe.selectedFilteredEvent;
    }
    const fromList = (fe.filteredEvents || []).find((d) => d?.uid === record?.uid);
    return fromList || record;
  }

  updateFields = (changes) => {
    const liveRecord = this.getLiveRecord();
    console.log('live record', liveRecord);
    
    const eventInterpretation = new EventInterpretation({
      caseId: liveRecord?.id || "UNKNOWN",
      alterationId: liveRecord.uid || "UNKNOWN",
      gene: liveRecord.gene,
      variant: liveRecord.variant,
      data: changes
    });
    
    console.log(eventInterpretation.serialize());
    
    this.props.dispatch(
      filteredEventsActions.updateAlterationFields(liveRecord.uid, changes)
    );
  }

  render() {
    const { t } = this.props;
    const liveRecord = this.getLiveRecord();
    
    if (!liveRecord) {
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
    } = liveRecord;

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
                      const eventInterpretation = new EventInterpretation({
                        caseId: liveRecord?.id || "UNKNOWN",
                        alterationId: liveRecord.uid || "UNKNOWN",
                        gene: liveRecord.gene,
                        variant: liveRecord.variant,
                        data: { tier: e.target.value }
                      });
                      console.log(eventInterpretation.serialize());
                      
                      this.props.dispatch(
                        filteredEventsActions.applyTierOverride(liveRecord.uid, e.target.value)
                      );
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
                value={this.state.geneSummary}
                onChange={(v) => {
                  this.setState({ geneSummary: v });
                  this.updateFields({ gene_summary: v });
                }}
               />
              <EditableTextBlock
                title={t("components.alteration-card.labels.variant-summary")}
                value={this.state.variantSummary}
                onChange={(v) => {
                  this.setState({ variantSummary: v });
                  this.updateFields({ variant_summary: v });
                }}
               />
              <EditableTextBlock
                title={t("components.alteration-card.labels.effect-description")}
                value={this.state.effectDescription}
                onChange={(v) => {
                  this.setState({ effectDescription: v });
                  this.updateFields({ effect_description: v });
                }}
               />
              <EditableTextBlock
                title={t("components.alteration-card.labels.notes")}
                value={this.state.notes}
                onChange={(v) => {
                  this.setState({ notes: v });
                  this.updateFields({ notes: v });
                }}
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
              list={this.state.therapeutics}
              onChange={(arr) => {
                this.setState({ therapeutics: arr });
                this.updateFields({ therapeutics: arr });
              }}
              pillClass="therapeutic-tag"
            />

            <EditablePillsBlock
              title={t("components.alteration-card.labels.resistances")}
              list={this.state.resistances}
              onChange={(arr) => {
                this.setState({ resistances: arr });
                this.updateFields({ resistances: arr });
              }}
              pillClass="resistance-tag"
            />

          </div>
        </Card>
      </Wrapper>
    );
  }
}

const mapStateToProps = (state) => ({
  filteredEvents: state?.FilteredEvents,
});

export default connect(mapStateToProps)(withTranslation("common")(AlterationCard));
