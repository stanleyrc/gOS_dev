import React, { useEffect, useMemo, useRef, useState } from "react";
import { BsDashLg } from "react-icons/bs";
import { Card, Tag, Typography, Descriptions, Avatar, Input } from "antd";
import { EditOutlined } from "@ant-design/icons";
import Wrapper from "./index.style";
import { tierColor } from "../../helpers/utility";

const { Title, Text, Paragraph } = Typography;

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String).map((s) => s.trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Helpers to format PMIDs into links safely
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePmId(item) {
  if (item == null) return "";
  if (typeof item === "number") return String(item);
  if (typeof item === "string") {
    const m = item.match(/\b(\d{1,10})\b/);
    return m ? m[1] : "";
  }
  const id = item.pmid || item.PMID || item.uid || item.id || item.Id;
  return id ? normalizePmId(String(id)) : "";
}

function pmidToUrl(id) {
  const pmid = normalizePmId(id);
  return pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "";
}

function linkPmids(text) {
  if (!text) return "";
  const escaped = escapeHtml(String(text));
  const pmidRegex = /(PMID:\s*)([\d,\s]+)/g;
  return escaped.replace(pmidRegex, (match, prefix, pmidString) => {
    const pmids = pmidString
      .trim()
      .split(/,\s*/)
      .filter(Boolean);
    const links = pmids
      .map((pmid) => {
        const id = normalizePmId(pmid);
        const url = pmidToUrl(id);
        return url
          ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${id}</a>`
          : escapeHtml(pmid);
      })
      .join(", ");
    return `${prefix}${links}`;
  });
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
  } = record;

  const tierStr = tier != null ? String(tier) : "Other";
  const geneLabel = (gene || "Unknown").replace("::", "-");
  const variantTitle = variant || "";

  const roles = toList(role);
  const therapeuticsList = toList(therapeutics);
  const resistancesList = toList(resistances);

  const tierStrInit = tier != null ? String(tier) : "3";
  const [local, setLocal] = useState({
    tier: ["1", "2", "3"].includes(tierStrInit) ? tierStrInit : "3",
    geneSummary: gene_summary || "",
    variantSummary: variant_summary || "",
    effectDescription: effect_description || "",
    therapeutics: therapeuticsList,
    resistances: resistancesList,
    notes: "",
  });

  const hasMetrics =
    vaf !== undefined ||
    estimatedAlteredCopies !== undefined ||
    altCounts !== undefined ||
    refCounts !== undefined;

  const unavailable = null
  const unavailableMetric = (<Text italic disabled> <BsDashLg /> </Text>)

  if (!record) {
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
            {local.tier && (
              <div className="tier-control" title={`Tier ${local.tier}`}>
                <Avatar
                  size={32}
                  style={{
                    backgroundColor: tierColor(+local.tier) || "#6c757d",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                >
                  {local.tier}
                </Avatar>
                <select
                  className="tier-select"
                  value={local.tier}
                  onChange={(e) => setLocal((s) => ({ ...s, tier: e.target.value }))}
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
              onChange={(v) => setLocal((s) => ({ ...s, geneSummary: v }))}
             />
            <EditableTextBlock
              title="Variant Summary"
              value={local.variantSummary}
              onChange={(v) => setLocal((s) => ({ ...s, variantSummary: v }))}
             />
            <EditableTextBlock
              title="Effect Description"
              value={local.effectDescription}
              onChange={(v) => setLocal((s) => ({ ...s, effectDescription: v }))}
             />
            <EditableNotesBlock
              value={local.notes}
              onChange={(v) => setLocal((s) => ({ ...s, notes: v }))}
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
            onChange={(arr) => setLocal((s) => ({ ...s, therapeutics: arr }))}
            pillClass="therapeutic-tag"
          />

          <EditablePillsBlock
            title="Resistances"
            list={local.resistances}
            onChange={(arr) => setLocal((s) => ({ ...s, resistances: arr }))}
            pillClass="resistance-tag"
          />

        </div>
      </Card>
    </Wrapper>
  );
}
