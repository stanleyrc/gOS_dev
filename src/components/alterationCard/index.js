import React, { Component } from "react";
import { connect } from "react-redux";
import { BsDashLg } from "react-icons/bs";
import {
  Card,
  Tag,
  Typography,
  Descriptions,
  Avatar,
  Button,
  Tooltip,
} from "antd";
import Wrapper from "./index.style";
import { tierColor, getTimeAgo } from "../../helpers/utility";
import interpretationsActions from "../../redux/interpretations/actions";
import EditableTextBlock from "../editableTextBlock";
import EditablePillsBlock from "../editablePillsBlock";
import { withTranslation } from "react-i18next";
import EventInterpretation from "../../helpers/EventInterpretation";
import {
  getInterpretationSourceCaseId,
  getTierCountsForInterpretations,
} from "../../helpers/interpretationHistory";

import InterpretationVersionsSidepanel from "../interpretationVersionsSidepanel";
import {
  getInterpretationForAlteration,
  getAllInterpretationsForEvent,
  getBaseEvent,
} from "../../redux/interpretations/selectors";
import TierDistributionBarChart from "../tierDistributionBarChart";
import InterpretationsAvatar from "../interpretationsAvatar";
import createFrequencyColumn from "./frequencyColumn";

const { Title, Text } = Typography;

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value))
    return value
      .filter(Boolean)
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export class AlterationCard extends Component {
  state = {
    showVersions: false,
    selectedInterpretation: null, // When set, overrides the current one
  };

  componentDidUpdate(prevProps) {
    const eventChanged = prevProps.record?.uid !== this.props.record?.uid;
    const caseChanged = prevProps.caseId !== this.props.caseId;
    const datasetChanged =
      prevProps.dataset?.id !== this.props.dataset?.id;
    if (
      this.state.selectedInterpretation &&
      (eventChanged || caseChanged || datasetChanged)
    ) {
      this.setState({ selectedInterpretation: null });
    }
  }

  updateFields = async (changes) => {
    const { record, caseId, dataset } = this.props;
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
      datasetId: dataset?.id,
      caseId: caseId || record?.id || "UNKNOWN",
      alterationId: record?.uid || "UNKNOWN",
      gene: record?.gene,
      variant: record?.variant,
      variant_type: record?.type,
      data,
    });

    const payload = eventInterpretation.toJSON();

    this.props.dispatch(interpretationsActions.updateInterpretation(payload));
  };

  handleShowVersions = () => {
    this.setState({ showVersions: true });
  };

  handleCloseVersions = () => {
    this.setState({ showVersions: false });
  };

  handleSelectInterpretation = (interpretation) => {
    this.setState({
      selectedInterpretation: interpretation,
      showVersions: false,
    });
  };

  handleClearSelection = () => {
    this.setState({ selectedInterpretation: null });
  };

  handleRefreshVersions = () => {
    const { record } = this.props;
    this.props.dispatch(
      interpretationsActions.fetchInterpretationsForCase(this.props.caseId)
    );
  };

  handleCopyVersion = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to overwrite your version with this one?"
    );
    if (!confirmed) return;

    const { selectedInterpretation } = this.state;
    const { caseId, record, dataset } = this.props;
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
      datasetId: dataset?.id,
      caseId,
      alterationId: record?.uid,
      gene: record?.gene,
      variant: record?.variant,
      variant_type: record?.type,
      data,
    });

    this.props.dispatch(
      interpretationsActions.updateInterpretation(eventInterpretation.toJSON())
    );
    this.setState({ selectedInterpretation: null });
  };

  getTierTooltipContent() {
    const { baseRecord, interpretationsStatus, record, tierCounts } = this.props;
    if (interpretationsStatus === "pending") {
      return "Loading tier distribution...";
    }

    const total =
      (tierCounts[1] || 0) + (tierCounts[2] || 0) + (tierCounts[3] || 0);
    if (total === 0) {
      return "No retiering found for this gene variant";
    }

    const originalTier = baseRecord?.tier || 3;

    return (
      <TierDistributionBarChart
        width={300}
        height={150}
        tierCounts={tierCounts}
        originalTier={originalTier}
        gene={record.gene}
        variantType={record.type}
        variant={record.variant}
      />
    );
  }

  render() {
    const {
      t,
      record,
      interpretation,
      allInterpretations,
      baseRecord,
      datasets,
    } = this.props;
    const { showVersions, selectedInterpretation } = this.state;

    if (!record) {
      return (
        <Wrapper>
          <Card className="variant-card">
            <Text type="secondary">
              {t("components.alteration-card.no-alteration")}
            </Text>
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
    const displayData = {
      ...record,
      ...baseDefaults,
      ...displayInterpretation?.data,
    };

    const currentTierStr = ["1", "2", "3"].includes(String(displayData.tier))
      ? String(displayData.tier)
      : "3";
    const geneLabel = (gene || t("components.alteration-card.unknown")).replace(
      "::",
      "-"
    );
    const variantTitle = variant || "";

    const roles = toList(role);

    const hasMetrics =
      vaf !== undefined ||
      estimatedAlteredCopies !== undefined ||
      altCounts !== undefined ||
      refCounts !== undefined;

    const unavailableMetric = (
      <Text italic disabled>
        {" "}
        <BsDashLg />{" "}
      </Text>
    );

    // Check if current user is viewing their own interpretation
    const isCurrentUser =
      !selectedInterpretation || displayInterpretation?.isCurrentUser;

    const historyLabel = t("components.alteration-card.tier-history");
    const authorName = displayInterpretation?.authorName;
    const lastModified = displayInterpretation?.lastModified;
    const dateStr = lastModified ? getTimeAgo(new Date(lastModified)) : "";
    const historyTooltip = authorName
      ? `Last modified by ${authorName}${dateStr ? ` ${dateStr}` : ""}`
      : historyLabel;

    return (
      <Wrapper>
        <Card className="variant-card" bordered bodyStyle={{ padding: "16px" }}>
          {!isCurrentUser && (
            <div className="copy-version-actions">
              <Button
                type="primary"
                size="small"
                onClick={this.handleCopyVersion}
                style={{
                  fontSize: "12px",
                  height: "auto",
                  lineHeight: "1",
                }}
              >
                Copy to My Version
              </Button>
            </div>
          )}
          <div className="variant-header">
            <div className="gene-left">
              {currentTierStr && (
                <Tooltip
                  title={this.getTierTooltipContent()}
                  placement="bottom"
                  overlayStyle={{ maxWidth: "350px" }}
                  align={{ offset: [10, 0] }}
                >
                  <div className="tier-control">
                    <Avatar
                      size={32}
                      style={{
                        backgroundColor:
                          tierColor(+currentTierStr) || "#6c757d",
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
                      aria-label={t(
                        "components.alteration-card.tier-select.label",
                        { gene: geneLabel, variant: variantTitle }
                      )}
                    >
                      <option value="1">
                        {t("components.alteration-card.tier-select.options.1")}
                      </option>
                      <option value="2">
                        {t("components.alteration-card.tier-select.options.2")}
                      </option>
                      <option value="3">
                        {t("components.alteration-card.tier-select.options.3")}
                      </option>
                    </select>
                  </div>
                </Tooltip>
              )}
              <div className="variant-heading">
                <Title
                  level={4}
                  className="gene-title"
                  style={{ marginBottom: 0 }}
                >
                  {geneLabel}
                </Title>
                {variantTitle ? (
                  <span className="variant-title">{variantTitle}</span>
                ) : null}
                <Tooltip title={historyTooltip} placement="bottom">
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    className="tier-history-button"
                    onClick={this.handleShowVersions}
                  >
                    {historyLabel}
                  </Button>
                </Tooltip>
              </div>
            </div>
            <div className="gene-right">
              {roles.map((r) => (
                <Tag key={`role-${r}`} className="pill role-pill">
                  {r}
                </Tag>
              ))}
              {effect ? <Tag className="pill effect-pill">{effect}</Tag> : null}
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
                title={t(
                  "components.alteration-card.labels.effect-description"
                )}
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
                  <Descriptions.Item
                    label={t("components.alteration-card.labels.vaf")}
                  >
                    {vaf !== undefined ? (
                      <span className="monospace">{String(vaf)}</span>
                    ) : (
                      unavailableMetric
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item
                    label={t("components.alteration-card.labels.multiplicity")}
                  >
                    {estimatedAlteredCopies !== undefined ? (
                      <span className="monospace">
                        {String(estimatedAlteredCopies)}
                      </span>
                    ) : (
                      unavailableMetric
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item
                    label={t("components.alteration-card.labels.tumor-alt")}
                  >
                    {altCounts !== undefined ? (
                      <span className="monospace">{String(altCounts)}</span>
                    ) : (
                      unavailableMetric
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item
                    label={t("components.alteration-card.labels.tumor-ref")}
                  >
                    {refCounts !== undefined ? (
                      <span className="monospace">{String(refCounts)}</span>
                    ) : (
                      unavailableMetric
                    )}
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
          title={t("components.interpretationVersionsSidepanel.tierHistoryTitle")}
          isOpen={showVersions}
          onOpen={this.handleRefreshVersions}
          onClose={this.handleCloseVersions}
          onSelect={this.handleSelectInterpretation}
          datasets={datasets}
          additionalColumns={[
            {
              title: "Case ID",
              dataIndex: "caseId",
              key: "caseId",
              width: 100,
              render: (text, record) => getInterpretationSourceCaseId(record),
            },
            {
              title: "Gene",
              dataIndex: "gene",
              key: "gene",
              width: 100,
            },
            {
              title: "Type",
              dataIndex: "variant_type",
              key: "variant_type",
              width: 100,
            },
            {
              title: "Tier",
              dataIndex: "tier",
              key: "tier",
              width: 80,
              minWidth: 80,
              render: (text, record) => {
                const tier = record.data?.tier;
                if (!tier) return "";
                return (
                  <Avatar
                    size={20}
                    style={{
                      backgroundColor: tierColor(+tier) || "#6c757d",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {tier}
                  </Avatar>
                );
              },
              sorter: (a, b) => (a.data?.tier || 3) - (b.data?.tier || 3),
            },
            createFrequencyColumn(),
            {
              title: "Variant",
              dataIndex: "variant",
              key: "variant",
              width: 100,
            },
          ]}
        />
      </Wrapper>
    );
  }
}

const mapStateToProps = (state, ownProps) => {
  const allInterpretations = getAllInterpretationsForEvent(
    state,
    ownProps.record,
  );
  return {
    caseId: state?.CaseReport?.id,
    interpretation: getInterpretationForAlteration(state, ownProps.record?.uid),
    allInterpretations,
    tierCounts: getTierCountsForInterpretations(allInterpretations),
    interpretationsStatus: state.Interpretations?.status,
    baseRecord: getBaseEvent(state, ownProps.record?.uid),
    dataset: state?.Settings?.dataset,
    datasets: state?.Datasets?.records || [],
  };
};

export default connect(mapStateToProps)(
  withTranslation("common")(AlterationCard)
);
