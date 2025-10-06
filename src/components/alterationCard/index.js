import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BsDashLg } from "react-icons/bs";
import { Card, Tag, Typography, Descriptions, Avatar, Input } from "antd";
import { EditOutlined } from "@ant-design/icons";
import Wrapper from "./index.style";
import { tierColor } from "../../helpers/utility";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import { linkPmids } from "../../helpers/format";
import { useTranslation } from "react-i18next";

const { Title, Text } = Typography;

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String).map((s) => s.trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}



function EditableTextBlock({ title, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = useRef(null);

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  useEffect(() => {
    if (editing && ref.current) {
      // put focus inside the edit box on enter
      ref.current.focus({ cursor: "end" });
    }
  }, [editing]);

  const handleBlur = () => {
    onChange(draft || "");
    setEditing(false);
  };

  return (
    <div className="desc-block editable-field">
      <div className="desc-title">
        {title}:
        <button
          type="button"
          className="edit-btn"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${title}`}
        >
          <EditOutlined />
        </button>
      </div>
      {editing ? (
        <Input.TextArea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoSize={{ minRows: 3 }}
          onBlur={handleBlur}
        />
      ) : value ? (
        <div
          className="desc-text"
          dangerouslySetInnerHTML={{ __html: linkPmids(value) }}
        />
      ) : null}
    </div>
  );
}

function EditablePillsBlock({ title, list, onChange, pillClass }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  const plain = useMemo(() => (list || []).join(", "), [list]);
  const [draft, setDraft] = useState(plain);

  useEffect(() => {
    setDraft(plain);
  }, [plain]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus({ cursor: "end" });
    }
  }, [editing]);

  const handleBlur = () => {
    const items = String(draft || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange(items);
    setEditing(false);
  };

  return (
    <div className="desc-block editable-field">
      <div className="desc-title">
        {title}:
        <button
          type="button"
          className="edit-btn"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${title}`}
        >
          <EditOutlined />
        </button>
      </div>
      {editing ? (
        <Input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
        />
      ) : (
        <div className={`${pillClass === "resistance-tag" ? "resistance-tags" : "therapeutics-tags"}`}>
          {(list || []).length
            ? list.map((v) => (
                <Tag
                  key={`${title}-${v}`}
                  className={`pill ${pillClass}`}
                  color={pillClass === "resistance-tag" ? "red" : "green"}
                >
                  {v}
                </Tag>
              ))
            : null}
        </div>
      )}
    </div>
  );
}


export default function AlterationCard({ record }) {
  const { t } = useTranslation("common");
  const liveRecord = useSelector((state) => {
    const fe = state?.FilteredEvents;
    if (!fe) return record;
    if (record?.uid && fe.selectedFilteredEvent?.uid === record.uid) {
      return fe.selectedFilteredEvent;
    }
    const fromList = (fe.filteredEvents || []).find((d) => d?.uid === record?.uid);
    return fromList || record;
  });
  const {
    tier,
    gene,
    variant,
    role,
    effect,
    gene_summary,
    variant_summary,
    effect_description,
    therapeutics,
    resistances,
    vaf,
    estimatedAlteredCopies,
    altCounts,
    refCounts,
  } = liveRecord || {};

  const dispatch = useDispatch();
  const currentTierStr = ["1", "2", "3"].includes(String(tier))
    ? String(tier)
    : "3";
  const geneLabel = (gene || t("components.alteration-card.unknown")).replace("::", "-");
  const variantTitle = variant || "";

  const roles = toList(role);
  const therapeuticsList = toList(therapeutics);
  const resistancesList = toList(resistances);

  const updateFields = (changes) =>
    dispatch(
      filteredEventsActions.updateAlterationFields(liveRecord.uid, changes)
    );

  const [local, setLocal] = useState({
    geneSummary: gene_summary || "",
    variantSummary: variant_summary || "",
    effectDescription: effect_description || "",
    therapeutics: therapeuticsList,
    resistances: resistancesList,
    notes: "",
  });

  useEffect(() => {
    setLocal({
      geneSummary: gene_summary || "",
      variantSummary: variant_summary || "",
      effectDescription: effect_description || "",
      therapeutics: therapeuticsList,
      resistances: resistancesList,
      notes: (liveRecord && liveRecord.notes) || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gene_summary,
    variant_summary,
    effect_description,
    therapeuticsList.join("|"),
    resistancesList.join("|"),
    liveRecord && liveRecord.notes,
  ]);

  const hasMetrics =
    vaf !== undefined ||
    estimatedAlteredCopies !== undefined ||
    altCounts !== undefined ||
    refCounts !== undefined;

  const unavailableMetric = (<Text italic disabled> <BsDashLg /> </Text>)

  if (!liveRecord) {
    return (
      <Wrapper>
        <Card className="variant-card">
          <Text type="secondary">{t("components.alteration-card.no-alteration")}</Text>
        </Card>
      </Wrapper>
    );
  }


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
                  onChange={(e) =>
                    dispatch(
                      filteredEventsActions.applyTierOverride(liveRecord.uid, e.target.value)
                    )
                  }
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
              value={local.geneSummary}
              onChange={(v) => {
                setLocal((s) => ({ ...s, geneSummary: v }));
                updateFields({ gene_summary: v });
              }}
             />
            <EditableTextBlock
              title={t("components.alteration-card.labels.variant-summary")}
              value={local.variantSummary}
              onChange={(v) => {
                setLocal((s) => ({ ...s, variantSummary: v }));
                updateFields({ variant_summary: v });
              }}
             />
            <EditableTextBlock
              title={t("components.alteration-card.labels.effect-description")}
              value={local.effectDescription}
              onChange={(v) => {
                setLocal((s) => ({ ...s, effectDescription: v }));
                updateFields({ effect_description: v });
              }}
             />
            <EditableTextBlock
              title={t("components.alteration-card.labels.notes")}
              value={local.notes}
              onChange={(v) => {
                setLocal((s) => ({ ...s, notes: v }));
                updateFields({ notes: v });
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
            list={local.therapeutics}
            onChange={(arr) => {
              setLocal((s) => ({ ...s, therapeutics: arr }));
              updateFields({ therapeutics: arr });
            }}
            pillClass="therapeutic-tag"
          />

          <EditablePillsBlock
            title={t("components.alteration-card.labels.resistances")}
            list={local.resistances}
            onChange={(arr) => {
              setLocal((s) => ({ ...s, resistances: arr }));
              updateFields({ resistances: arr });
            }}
            pillClass="resistance-tag"
          />

        </div>
      </Card>
    </Wrapper>
  );
}
