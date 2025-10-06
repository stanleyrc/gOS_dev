import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BsDashLg } from "react-icons/bs";
import { Card, Tag, Typography, Descriptions, Avatar, Input } from "antd";
import { EditOutlined } from "@ant-design/icons";
import Wrapper from "./index.style";
import { tierColor } from "../../helpers/utility";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import { linkPmids } from "../../helpers/format";

const { Title, Text, Paragraph } = Typography;

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String).map((s) => s.trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}


function asLinkedHtml(text) {
  return { __html: linkPmids(text) };
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
          dangerouslySetInnerHTML={asLinkedHtml(value)}
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

function EditableNotesBlock({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = useRef(null);

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus({ cursor: "end" });
    }
  }, [editing]);

  const handleBlur = () => {
    onChange(draft || "");
    setEditing(false);
  };

  const isEmpty = !value;

  return (
    <div className="desc-block editable-field notes-block" style={{ marginTop: 12 }}>
      <div className="desc-title">
        Notes:
        <button
          type="button"
          className="edit-btn"
          onClick={() => setEditing(true)}
          aria-label="Edit Notes"
        >
          <EditOutlined />
        </button>
      </div>
      {editing ? (
        <Input.TextArea
          ref={ref}
          className="note-textarea"
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
        />
      ) : (
        <div
          className={`note-display ${isEmpty ? "is-empty" : ""}`}
          data-placeholder="Click to add notes…"
          onClick={() => setEditing(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setEditing(true);
          }}
          aria-label="Click to edit notes"
        >
          {value}
        </div>
      )}
    </div>
  );
}

export default function AlterationCard({ record }) {
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
  const geneLabel = (gene || "Unknown").replace("::", "-");
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

  const unavailable = null
  const unavailableMetric = (<Text italic disabled> <BsDashLg /> </Text>)

  if (!liveRecord) {
    return (
      <Wrapper>
        <Card className="variant-card">
          <Text type="secondary">No alteration selected.</Text>
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
              <div className="tier-control" title={`Tier ${currentTierStr}`}>
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
                  aria-label={`Set tier for ${geneLabel} ${variantTitle}`}
                >
                  <option value="1">Tier 1</option>
                  <option value="2">Tier 2</option>
                  <option value="3">Tier 3 / Exclude</option>
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
              title="Gene Summary"
              value={local.geneSummary}
              onChange={(v) => {
                setLocal((s) => ({ ...s, geneSummary: v }));
                updateFields({ gene_summary: v });
              }}
             />
            <EditableTextBlock
              title="Variant Summary"
              value={local.variantSummary}
              onChange={(v) => {
                setLocal((s) => ({ ...s, variantSummary: v }));
                updateFields({ variant_summary: v });
              }}
             />
            <EditableTextBlock
              title="Effect Description"
              value={local.effectDescription}
              onChange={(v) => {
                setLocal((s) => ({ ...s, effectDescription: v }));
                updateFields({ effect_description: v });
              }}
             />
            <EditableNotesBlock
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
                <Descriptions.Item label="VAF">
                  {vaf !== undefined ? <span className="monospace">{String(vaf)}</span> : unavailableMetric}
                </Descriptions.Item>
                <Descriptions.Item label="Multiplicity">
                  {estimatedAlteredCopies !== undefined ? (
                    <span className="monospace">{String(estimatedAlteredCopies)}</span>
                  ) : (
                    unavailableMetric
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Tumor Alt">
                  {altCounts !== undefined ? <span className="monospace">{String(altCounts)}</span> : unavailableMetric}
                </Descriptions.Item>
                <Descriptions.Item label="Tumor Ref">
                  {refCounts !== undefined ? <span className="monospace">{String(refCounts)}</span> : unavailableMetric}
                </Descriptions.Item>
              </Descriptions>
            </div>
          ) : null}
        </div>


        <div className="variant-footer">
          <EditablePillsBlock
            title="Therapeutics"
            list={local.therapeutics}
            onChange={(arr) => {
              setLocal((s) => ({ ...s, therapeutics: arr }));
              updateFields({ therapeutics: arr });
            }}
            pillClass="therapeutic-tag"
          />

          <EditablePillsBlock
            title="Resistances"
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
