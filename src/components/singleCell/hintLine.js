import React from "react";
import { Tooltip, Typography } from "antd";
import { DatabaseOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { WHERE, provenanceOf } from "../../helpers/singleCell/provenance";

const { Text } = Typography;

/**
 * Tooltip body for a provenance entry (helpers/singleCell/provenance.js):
 * optional help text, then where the data comes from, what is calculated,
 * and a small badge saying whether that runs in the browser or the pipeline.
 */
export function ProvenanceTip({ id, text }) {
  const entry = provenanceOf(id);
  if (!entry) return text ? <div className="sc-prov-tip">{text}</div> : null;
  const where = WHERE[entry.where] || WHERE.both;
  return (
    <div className="sc-prov-tip">
      {text && <div className="sc-prov-help">{text}</div>}
      <div className="sc-prov-row">
        <span className="sc-prov-key">Data</span>
        <span>{entry.source}</span>
      </div>
      <div className="sc-prov-row">
        <span className="sc-prov-key">Calc</span>
        <span>{entry.calc}</span>
      </div>
      <span className={`sc-prov-badge sc-prov-${entry.where}`}>{where.label}</span>
    </div>
  );
}

/**
 * Provenance hover. With children: the children get a dotted underline
 * (for a derived number or a label). Without: a small database icon (for
 * a card title). `text` adds a line of help above the provenance.
 */
export function Provenance({ id, text, children, placement = "bottomLeft" }) {
  if (!provenanceOf(id)) return children || null;
  const tip = <ProvenanceTip id={id} text={text} />;
  if (children) {
    return (
      <Tooltip title={tip} overlayClassName="sc-prov-overlay" placement={placement} mouseEnterDelay={0.15}>
        <span className="sc-prov-underline">{children}</span>
      </Tooltip>
    );
  }
  return (
    <Tooltip title={tip} overlayClassName="sc-prov-overlay" placement={placement}>
      <DatabaseOutlined className="sc-hint-icon sc-prov-icon" aria-label={`Data source: ${provenanceOf(id).title}`} />
    </Tooltip>
  );
}

/**
 * Explanatory text collapsed to one muted line: an info icon plus the start
 * of the text, cut with an ellipsis; hover shows all of it. Replaces the
 * multi-line help paragraphs under plots so they cost ~18 px, not 40-60.
 * `inline` renders only the icon (for card titles / control rows).
 */
export default function HintLine({ text, inline = false, style, provenance }) {
  if (!text) return provenance ? <Provenance id={provenance} /> : null;
  const tip = provenance ? (
    <ProvenanceTip id={provenance} text={text} />
  ) : (
    <div style={{ maxWidth: 520, whiteSpace: "normal" }}>{text}</div>
  );
  if (inline) {
    return (
      <Tooltip title={tip} overlayStyle={{ maxWidth: 560 }} overlayClassName={provenance ? "sc-prov-overlay" : undefined}>
        <InfoCircleOutlined className={provenance ? "sc-hint-icon sc-prov-icon" : "sc-hint-icon"} />
      </Tooltip>
    );
  }
  return (
    <Tooltip title={tip} overlayStyle={{ maxWidth: 560 }} mouseEnterDelay={0.2} overlayClassName={provenance ? "sc-prov-overlay" : undefined}>
      <div className="sc-hint-line" style={style}>
        <InfoCircleOutlined className="sc-hint-icon" />
        <Text type="secondary">{text}</Text>
      </div>
    </Tooltip>
  );
}
