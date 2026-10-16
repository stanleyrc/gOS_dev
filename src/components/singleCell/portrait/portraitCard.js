import React from "react";
import { Card, Space, Table, Tag, Tooltip, Typography } from "antd";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { STATE_COLORS, STATE_ORDER, VERDICTS, pctText, placementText, portraitHref, portraitUnavailable, sortNovel, STATUS_LABEL, verdictOf } from "../../../helpers/singleCell/portrait";

const { Text } = Typography;
const STATUS_COLOR = { robust: "green", candidate: "blue", exploratory: "default" };

export function PortraitLink({ link, children }) {
  if (!link) return children;
  return (
    <a href={portraitHref(link)} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function VerdictTag({ verdict }) {
  const v = verdictOf(verdict);
  return (
    <Tag color={v.color} style={{ marginRight: 0 }}>
      {v.glyph} {v.label}
    </Tag>
  );
}

/** Stacked bar of the four cell states; counts in the tooltip. */
export function StateBar({ counts = {}, width = 220, height = 14 }) {
  const n = STATE_ORDER.reduce((s, k) => s + (counts[k] || 0), 0);
  if (!n) return <Text type="secondary">no RNA states</Text>;
  return (
    <Tooltip title={STATE_ORDER.map((k) => `${k} ${counts[k] || 0} (${pctText((counts[k] || 0) / n)})`).join(", ")}>
      <span style={{ display: "inline-flex", width, height, borderRadius: 2, overflow: "hidden", verticalAlign: "middle" }}>
        {STATE_ORDER.map((k) => (counts[k] ? <span key={k} style={{ width: `${(100 * counts[k]) / n}%`, background: STATE_COLORS[k] }} /> : null))}
      </span>
    </Tooltip>
  );
}

function Section({ letter, title, children, note }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: TYPE.body, fontWeight: 600, marginBottom: 4 }}>
        {letter}. {title}
        {note && <Text type="secondary" style={{ fontWeight: 400, fontSize: TYPE.label, marginLeft: 8 }}>{note}</Text>}
      </div>
      {children}
    </div>
  );
}

function Genotype({ g, patient }) {
  const eventCols = [
    { title: "Event", dataIndex: "label", key: "label", width: 190 },
    { title: "Cells", key: "n", width: 120, render: (_, e) => `${e.n} (${pctText(e.frac)})` },
    { title: "Placement", key: "pl", render: (_, e) => <Tag color={e.truncal ? "blue" : "default"}>{placementText(e)}</Tag> },
  ];
  const snvs = (g.snvs || []).filter((s) => s.frac != null);
  return (
    <>
      {g.events?.length ? (
        <Table size="small" rowKey="id" pagination={false} dataSource={g.events} columns={eventCols} scroll={{ x: true }} />
      ) : (
        <Text type="secondary">not available (no copy-number events placed on the tree)</Text>
      )}
      {snvs.length > 0 && (
        <div style={{ marginTop: 6, fontSize: TYPE.label }}>
          <Text strong>Driver SNVs: </Text>
          {snvs.map((s, i) => (
            <Tooltip key={`${s.gene}${s.variant}${i}`} title={`${s.class}, tier ${s.tier ?? "n/a"}, ${s.n_cells} carrier cells, source ${s.source}${s.qc_flags?.length ? `; flags: ${s.qc_flags.join("; ")}` : ""}`}>
              <Tag color={s.frac >= 0.85 ? "blue" : "default"}>
                {s.gene} {s.variant} {pctText(s.frac)}
              </Tag>
            </Tooltip>
          ))}
        </div>
      )}
      {g.ecdna_walks?.length > 0 && (
        <div style={{ marginTop: 6, fontSize: TYPE.label }}>
          <Text strong>ecDNA: </Text>
          {g.ecdna_walks.map((w) => (
            <PortraitLink key={w.label} link={{ report: patient, tab: 14, walk: w.label }}>
              <Tag color="purple" style={{ cursor: "pointer" }}>
                {w.label} ({w.genes}) {w.ncells} cells, median {w.median_cn} copies
              </Tag>
            </PortraitLink>
          ))}
        </div>
      )}
      {g.subclonal_qc_pass?.length > 0 && (
        <div style={{ marginTop: 6, fontSize: TYPE.label }}>
          <Text strong>Subclonal SNVs passing read QC: </Text>
          {g.subclonal_qc_pass.map((h) => (
            <PortraitLink key={h.site} link={{ report: patient, tab: 15, evsite: h.site }}>
              <Tag style={{ cursor: "pointer" }}>
                {h.gene} {h.variant} {pctText(h.frac)}
              </Tag>
            </PortraitLink>
          ))}
        </div>
      )}
      {g.flagged_hits?.length > 0 && (
        <div style={{ marginTop: 6, fontSize: TYPE.label }}>
          <Text type="secondary">Excluded by read-level QC (artefact risk): {g.flagged_hits.map((h) => `${h.gene} ${h.variant}`).join(", ")}</Text>
        </div>
      )}
    </>
  );
}

function Evolution({ e }) {
  const lines = [];
  lines.push(`${e.n_tumour_cells} tumour cells, ${e.n_clades} called clades${e.old_tree ? " (older tree without SNV-anchored placement)" : ""}.`);
  const first = (e.timing || []).filter((t) => t.t0 != null).slice(0, 6);
  if (first.length) lines.push("Order of placed events (relative time 0 = trunk, 1 = single cells): " + first.map((t) => `${t.label} ${t.truncal ? "truncal" : `t = ${t.t0.toFixed(2)}`}`).join("; ") + ".");
  if (e.signature_contrasts?.length)
    lines.push("Subclonal vs truncal SNV signatures (q < 0.05): " + e.signature_contrasts.map((c) => `${c.signature} ${pctText(c.frac_subclonal)} vs ${pctText(c.frac_truncal)}`).join("; ") + ".");
  else lines.push("No signature differs between subclonal and truncal SNVs at q < 0.05 (or not fitted for this patient).");
  if (e.clade_signature_shifts?.length)
    lines.push(`${e.clade_signature_shifts.length} clade-level signature shift(s) at q < 0.05: ` + e.clade_signature_shifts.slice(0, 5).map((s) => `${s.clade.split("_").pop()} ${s.signature} ${s.diff > 0 ? "up" : "down"} (${pctText(s.frac)} vs ${pctText(s.frac_ref)} in ${s.vs.split("_").pop()})`).join("; ") + ".");
  if (e.tmb) lines.push(`SNV sites: ${e.tmb.n_truncal_sites} truncal, ${e.tmb.n_subclonal_sites} subclonal${e.tmb.noisy ? " (noisy calls)" : ""}.`);
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: TYPE.label }}>
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

function Phenotype({ ph }) {
  if (!ph.n_rna) return <Text type="secondary">not available (no RNA cells with a state and a DNA match)</Text>;
  return (
    <>
      <div style={{ fontSize: TYPE.label }}>
        <Space size={8} wrap>
          <StateBar counts={ph.counts} />
          <span>
            {STATE_ORDER.map((k) => `${k} ${pctText(ph.fractions?.[k])}`).join(" · ")}; {ph.n_rna} RNA cells; cycling {pctText(ph.cycling_frac)}
          </span>
        </Space>
      </div>
      <div style={{ fontSize: TYPE.label, marginTop: 4 }}>{ph.lineage_text}</div>
      {ph.composition?.length > 0 && (
        <div style={{ marginTop: 6, fontSize: TYPE.tick }}>
          {ph.composition.map((c) => (
            <div key={c.lineage} style={{ display: "flex", alignItems: "center", gap: 8, lineHeight: "18px" }}>
              <span style={{ width: 90 }}>{c.lineage}</span>
              <StateBar counts={c.counts} width={160} height={10} />
              <Text type="secondary">{c.n} cells</Text>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Checks({ checks, features }) {
  const rows = (features || Object.keys(checks)).map((f) => ({ key: f.key || f, label: f.label || f, canonical: f.canonical, ...checks[f.key || f] }));
  const cols = [
    { title: "Canonical feature", key: "label", width: 200, render: (_, r) => <Tooltip title={r.canonical}>{r.label}</Tooltip> },
    { title: "Verdict", key: "v", width: 150, render: (_, r) => <VerdictTag verdict={r.verdict} /> },
    { title: "Our evidence", key: "e", render: (_, r) => <span style={{ fontSize: TYPE.label }}>{r.evidence}</span> },
    { title: "", key: "l", width: 70, render: (_, r) => <PortraitLink link={r.link}>view</PortraitLink> },
  ];
  return <Table size="small" rowKey="key" pagination={false} dataSource={rows} columns={cols} scroll={{ x: true }} />;
}

function Novel({ items }) {
  if (!items?.length) return <Text type="secondary">nothing unexpected flagged for this patient (see the cohort Novel list)</Text>;
  return (
    <div>
      {sortNovel(items).map((n) => (
        <div key={n.id} style={{ marginBottom: 8, fontSize: TYPE.label }}>
          <Tag color={STATUS_COLOR[n.status]}>{STATUS_LABEL[n.status] || n.status}</Tag>
          <Text strong>{n.title}. </Text>
          {n.text}
          <div style={{ color: "var(--sc-muted, #666)" }}>Caveat: {n.caveat}</div>
          <Space size={8} wrap>
            {(n.links || []).map((l, i) => (
              <PortraitLink key={i} link={l}>
                {l.label}
              </PortraitLink>
            ))}
          </Space>
        </div>
      ))}
    </div>
  );
}

/**
 * One patient's multi-modal portrait: genotype, evolution, phenotype, checks against canonical GBM biology,
 * and what is unexpected. `features` (labels / canonical text per check) comes from the cohort export.
 */
export default function PortraitCard({ portrait, patient, features = null, bare = false }) {
  const miss = portraitUnavailable(portrait, patient);
  if (miss) return <Text type="secondary">{miss}</Text>;
  const body = (
    <>
      <Section letter="a" title="Genotype" note="events with at least 5 carrier cells; truncal = on the root clade or in 85% of cells">
        <Genotype g={portrait.genotype} patient={portrait.patient} />
      </Section>
      <Section letter="b" title="Evolution">
        <Evolution e={portrait.evolution} />
      </Section>
      <Section letter="c" title="Phenotype" note="Neftel states of RNA cells matched to a DNA genome">
        <Phenotype ph={portrait.phenotype} />
      </Section>
      <Section letter="d" title="Checks against canonical GBM biology">
        <Checks checks={portrait.checks} features={features} />
      </Section>
      <Section letter="e" title="Novel / unexpected">
        <Novel items={portrait.novel} />
      </Section>
    </>
  );
  if (bare) return body;
  return (
    <Card size="small" title={`${portrait.patient} portrait`} id={`portrait-${portrait.patient}`}>
      {body}
    </Card>
  );
}

export { VERDICTS };
