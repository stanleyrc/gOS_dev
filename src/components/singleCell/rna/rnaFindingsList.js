import React from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Space, Tag, Tooltip, Typography } from "antd";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { formatP } from "../../../helpers/singleCell/tests";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const pct = d3.format(".0%");
const fc = (v) => (Number.isFinite(v) ? v.toFixed(1) : "–");
const qLabel = (h) => (Number.isFinite(h.q) ? formatP(h.q).replace(/^p/, "q") : formatP(h.p));

/** Stacked bar of the tumor cells' cell-state mix. */
export function StateMixBar({ mix, width = 220, height = 10 }) {
  const colors = annotationColors(mix.map((m) => m.state));
  let x = 0;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {mix.map((m) => {
        const w = width * m.share;
        const r = (
          <rect key={m.state} x={x} y={0} width={Math.max(0, w - 0.5)} height={height} fill={colors[m.state]}>
            <title>{`${m.state}: ${m.count} (${pct(m.share)})`}</title>
          </rect>
        );
        x += w;
        return r;
      })}
    </svg>
  );
}

/** One headline as a sentence (see rnaHeadlines); silent amplifications are grouped by the caller. */
export function headlineText(h, t) {
  const k = `components.single-cell.rna-findings.${h.kind}`;
  switch (h.kind) {
    case "state-mix":
      return t(k, { n: h.n, state: h.mix[0].state, share: pct(h.mix[0].share), rest: h.mix.slice(1).map((m) => `${m.state} ${pct(m.share)}`).join(", ") || "–" });
    case "clone-state":
      return t(k, { clone: h.clone, state: h.state, a: pct(h.fraction), b: pct(h.otherFraction) });
    case "clone-cycling":
    case "clone-quiescent":
      return t(k, { clone: h.clone, a: pct(h.fraction), b: pct(h.otherFraction) });
    case "clone-region":
      return t(k, { clone: h.clone, region: h.region, a: pct(h.fraction), b: pct(h.otherFraction) });
    case "dosage":
      return t(`${k}-${h.class}`, { gene: h.gene, fc: fc(h.log2FC), a: pct(h.pctA), b: pct(h.pctB), nA: h.nA, nB: h.nB });
    case "clone-markers":
      return t(k, { clone: h.clone, genes: h.genes.join(", "), count: h.nSignificant });
    default:
      return "";
  }
}

/** Headlines minus the state mix, with the "not over-expressed" amplifications folded into one line. */
function groupedHeadlines(headlines) {
  const silent = headlines.filter((h) => h.kind === "silent-amp");
  const rest = headlines.filter((h) => h.kind !== "silent-amp" && h.kind !== "state-mix");
  return silent.length ? [...rest, { kind: "silent-amps", genes: silent.map((h) => h.gene), items: silent }] : rest;
}

const KIND_ORDER = ["dosage", "clone-state", "clone-cycling", "clone-quiescent", "clone-region", "clone-markers", "silent-amps"];
const KIND_COLOR = { dosage: "red", "silent-amps": "default", "clone-state": "purple", "clone-cycling": "orange", "clone-quiescent": "blue", "clone-region": "cyan", "clone-markers": "geekblue" };

/** Short sentence for the report's summary paragraph. */
export function rnaSummarySentence(findings, t) {
  if (!findings?.meta?.nRna) return null;
  const { meta, headlines } = findings;
  const mix = headlines.find((h) => h.kind === "state-mix");
  const parts = [t("components.single-cell.rna-findings.summary", { n: meta.nTumorMatched, total: meta.nRna })];
  if (mix) parts.push(t("components.single-cell.rna-findings.summary-state", { state: mix.mix[0].state, share: pct(mix.mix[0].share) }));
  const expressed = headlines.filter((h) => h.kind === "dosage").map((h) => h.gene);
  if (expressed.length) parts.push(t("components.single-cell.rna-findings.summary-dosage", { list: expressed.join(", ") }));
  const cloneLinked = [...new Set(headlines.filter((h) => h.kind === "clone-state" || h.kind === "clone-cycling").map((h) => h.clone))];
  if (cloneLinked.length) parts.push(t("components.single-cell.rna-findings.summary-clones", { list: cloneLinked.join(", ") }));
  return parts.join(" ");
}

/**
 * RNA key findings as tagged lines, strongest kinds first. findings: from
 * useRnaFindings; driverGenes marks marker genes that are also drivers.
 */
export default function RnaFindingsList({ findings, status = "ok", cloneColors = {}, driverGenes = new Set(), max = Infinity, showMix = true }) {
  const { t } = useTranslation("common");
  if (status === "loading" && !findings) return <Text type="secondary">{t("components.single-cell.rna-findings.loading")}</Text>;
  if (!findings?.meta?.nRna) return <Text type="secondary">{t("components.single-cell.rna-findings.none")}</Text>;
  const { meta, headlines, expr } = findings;
  const mix = headlines.find((h) => h.kind === "state-mix");
  const items = groupedHeadlines(headlines).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const shown = items.slice(0, max);
  const cloneTag = (clone) => <Tag color={cloneColors[clone]} style={{ marginRight: 4 }}>{clone}</Tag>;
  return (
    <Space direction="vertical" size={4} style={{ width: "100%" }}>
      {showMix && mix && (
        <div>
          <StateMixBar mix={mix.mix} />
          <Text style={{ fontSize: TYPE.label }}>{headlineText(mix, t)}</Text>
        </div>
      )}
      {shown.map((h, i) => (
        <div key={`${h.kind}-${h.clone || h.gene || i}`} style={{ fontSize: TYPE.label, lineHeight: 1.5 }}>
          <Tag color={KIND_COLOR[h.kind]} style={{ fontSize: TYPE.tick }}>{t(`components.single-cell.rna-findings.kind-${h.kind}`)}</Tag>
          {h.clone && cloneTag(h.clone)}
          {h.kind === "silent-amps" ? (
            <Tooltip title={h.items.map((x) => `${x.gene}: log2FC ${fc(x.log2FC)}, ${x.nA} carriers vs ${x.nB}, ${formatP(x.p)}`).join("\n")}>
              <Text>{t("components.single-cell.rna-findings.silent-amps", { list: h.genes.join(", ") })}</Text>
            </Tooltip>
          ) : h.kind === "clone-markers" ? (
            <Text>
              {t("components.single-cell.rna-findings.clone-markers-lead")}{" "}
              {h.genes.map((g, k) => (
                <React.Fragment key={g}>
                  {k > 0 && ", "}
                  <Text strong={driverGenes.has(g)} type={driverGenes.has(g) ? "danger" : undefined}>{g}</Text>
                </React.Fragment>
              ))}
              <Text type="secondary">{` ${t("components.single-cell.rna-findings.clone-markers-count", { count: h.nSignificant })}`}</Text>
            </Text>
          ) : (
            <Tooltip title={qLabel(h)}>
              <Text>{headlineText(h, t)}</Text>
            </Tooltip>
          )}
        </div>
      ))}
      {items.length > shown.length && <Text type="secondary" style={{ fontSize: TYPE.tick }}>{t("components.single-cell.rna-findings.more", { count: items.length - shown.length })}</Text>}
      {!items.length && <Text type="secondary" style={{ fontSize: TYPE.label }}>{t("components.single-cell.rna-findings.no-clone-differences")}</Text>}
      <Text type="secondary" style={{ fontSize: TYPE.tick }}>
        {t("components.single-cell.rna-findings.footer", { rna: meta.nRna, matched: meta.nTumorMatched, tumor: meta.nTumorDna })}
        {!expr && status === "ok" ? ` ${t("components.single-cell.rna-findings.no-matrix")}` : ""}
      </Text>
    </Space>
  );
}

/** One clone's RNA in a line: state mix, cycling share, top up-regulated genes. */
export function CloneRnaLine({ findings, clone }) {
  const { t } = useTranslation("common");
  const meta = findings?.meta;
  if (!meta) return null;
  const counts = meta.states?.byClone.counts[clone];
  const n = counts ? d3.sum(Object.values(counts)) : 0;
  if (!n) return null;
  const enriched = new Set((meta.states.byClone.enriched || []).filter((x) => x.clone === clone).map((x) => x.level));
  const top = Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const cyc = meta.cycling?.byClone?.[clone];
  const markers = findings.expr?.markers.find((m) => m.clone === clone)?.up || [];
  return (
    <div>
      <Text type="secondary" style={{ fontSize: TYPE.label }}>
        {t("components.single-cell.rna-findings.clone-line", { n })}{" "}
        {top.map(([l, v], k) => (
          <React.Fragment key={l}>
            {k > 0 && ", "}
            <span style={{ fontWeight: enriched.has(l) ? 600 : 400 }}>{`${l} ${pct(v / n)}${enriched.has(l) ? "*" : ""}`}</span>
          </React.Fragment>
        ))}
        {Number.isFinite(cyc) ? ` · ${t("components.single-cell.rna-findings.cycling", { pct: pct(cyc) })}` : ""}
        {markers.length ? ` · ${t("components.single-cell.rna-findings.up", { list: markers.slice(0, 4).map((r) => r.gene).join(", ") })}` : ""}
      </Text>
    </div>
  );
}
