import React from "react";
import { BsDashLg } from "react-icons/bs";
import { Card, Tag, Typography, Descriptions, Divider, Avatar, Input } from "antd";
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

export default function AlterationCard({ record }) {
  if (!record) {
    return (
      <Wrapper>
        <Card className="variant-card">
          <Text type="secondary">No alteration selected.</Text>
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

  const hasMetrics =
    vaf !== undefined ||
    estimatedAlteredCopies !== undefined ||
    altCounts !== undefined ||
    refCounts !== undefined;

  const unavailable = null
  const unavailableMetric = (<Text italic disabled> <BsDashLg /> </Text>)

  return (
    <Wrapper>
      <Card className="variant-card" bordered>
        <div className="variant-header">
          <div className="gene-left">
            {tierStr && (
              <div className="tier-control" title={`Tier ${tierStr}`}>
                <Avatar
                  size={32}
                  style={{ backgroundColor: tierColor(+tierStr) || "#6c757d", color: "#fff", fontWeight: 700 }}
                >
                  {tierStr}
                </Avatar>
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
            <div className="desc-block">
              <div className="desc-title">Gene Summary:</div>
              {gene_summary ? (
                <div className="desc-text" dangerouslySetInnerHTML={asLinkedHtml(gene_summary)} />
              ) : (
                unavailable
              )}
            </div>
            <div className="desc-block">
              <div className="desc-title">Variant Summary:</div>
              {variant_summary ? (
                <div className="desc-text" dangerouslySetInnerHTML={asLinkedHtml(variant_summary)} />
              ) : (
                unavailable
              )}
            </div>
            <div className="desc-block">
              <div className="desc-title">Effect Description:</div>
              {effect_description ? (
                <div className="desc-text" dangerouslySetInnerHTML={asLinkedHtml(effect_description)} />
              ) : (
                unavailable
              )}
            </div>
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

        <div className="desc-block notes-block" style={{ marginTop: 12 }}>
          <div className="desc-title">Notes:</div>
          <Input.TextArea
            className="notes-textarea"
            rows={4}
            readOnly
            value=""
            placeholder=""
          />
        </div>

        <div className="variant-footer">
          <div className="desc-block">
            <div className="desc-title">Therapeutics:</div>
            <div className="therapeutics-tags">
              {therapeuticsList.length
                ? therapeuticsList.map((t) => (
                    <Tag key={`ther-${t}`} className="pill therapeutic-tag" color="green">
                      {t}
                    </Tag>
                  ))
                : unavailable}
            </div>
          </div>

          <div className="desc-block" style={{ marginTop: 12 }}>
            <div className="desc-title">Resistances:</div>
            <div className="resistance-tags">
              {resistancesList.length
                ? resistancesList.map((r) => (
                    <Tag key={`res-${r}`} className="pill resistance-tag" color="red">
                      {r}
                    </Tag>
                  ))
                : unavailable}
            </div>
          </div>

        </div>
      </Card>
    </Wrapper>
  );
}
