import React from "react";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { ONCO_CLASS, ONCO_CLASS_LABEL, ONCO_STATUS, ONCO_STATUS_LABEL, withHeaders } from "../../../helpers/singleCell/clinicalFigure";

/** Okabe-Ito based categorical palette (colour-blind safe), used for sex / location / MGMT / assay strips. */
const CAT = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#D55E00", "#56B4E9", "#7a5195", "#999999"];
export function catColor(value, seen) {
  if (value == null) return null;
  const i = seen.indexOf(value);
  return CAT[(i < 0 ? 0 : i) % CAT.length];
}

export const statusFill = (theme) => ({
  recovered: theme.ok,
  partial: theme.warn,
  not_recovered: theme.danger,
  not_covered: theme.empty,
  germline_like: "none",
});

/** Alteration-class glyph centred at (cx, cy), half-size r. fill / stroke from the recovery status. */
export function ClassGlyph({ cls, cx, cy, r, status, theme, color = null }) {
  const fill = color || statusFill(theme)[status];
  const hollow = status === "germline_like";
  const stroke = hollow ? theme.text : status === "not_covered" ? theme.axis : "none";
  const p = { fill, stroke, strokeWidth: hollow ? 1.6 : 1 };
  if (cls === "snv") return <circle cx={cx} cy={cy} r={r * 0.85} {...p} />;
  if (cls === "tert") return <rect x={cx - r * 0.8} y={cy - r * 0.8} width={r * 1.6} height={r * 1.6} {...p} />;
  if (cls === "sv") return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} {...p} />;
  if (cls === "amp") return <polygon points={`${cx},${cy - r} ${cx + r},${cy + r * 0.8} ${cx - r},${cy + r * 0.8}`} {...p} />;
  if (cls === "homdel") return <polygon points={`${cx - r},${cy - r * 0.8} ${cx + r},${cy - r * 0.8} ${cx},${cy + r}`} {...p} />;
  // gain / loss: half-height triangles (lighter weight than amp / homdel)
  if (cls === "gain") return <polygon points={`${cx},${cy - r * 0.6} ${cx + r * 0.8},${cy + r * 0.5} ${cx - r * 0.8},${cy + r * 0.5}`} {...p} />;
  return <polygon points={`${cx - r * 0.8},${cy - r * 0.5} ${cx + r * 0.8},${cy - r * 0.5} ${cx},${cy + r * 0.6}`} {...p} />;
}

export function GlyphLegend({ theme, classes = ONCO_CLASS, statuses = ONCO_STATUS }) {
  const item = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: TYPE.tick, marginRight: 12 };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", rowGap: 4, marginBottom: 6 }}>
      <span style={{ ...item, color: theme.muted }}>Glyph:</span>
      {classes.map((c) => (
        <span key={c} style={item}>
          <svg width={16} height={16}><ClassGlyph cls={c} cx={8} cy={8} r={6} status="recovered" theme={{ ...theme, ok: theme.textSecondary }} /></svg>
          {ONCO_CLASS_LABEL[c]}
        </span>
      ))}
      <span style={{ flexBasis: "100%" }} />
      <span style={{ ...item, color: theme.muted }}>Fill:</span>
      {statuses.map((s) => (
        <span key={s} style={item}>
          <svg width={16} height={16}><ClassGlyph cls="snv" cx={8} cy={8} r={6} status={s} theme={theme} /></svg>
          {ONCO_STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

/** Tooltip text of one oncoprint entry: verbatim report line, our verdict and the evidence lines. */
export function entryTip(patient, e) {
  const r = e.row;
  const lines = [`${patient}: ${e.label} (${ONCO_STATUS_LABEL[e.status]})`];
  if (r.clinical_raw) lines.push(`report: ${r.clinical_raw}`);
  if (r.reason) lines.push(`single-cell: ${r.reason}`);
  (r.evidence || []).slice(0, 4).forEach((v) => {
    const bits = [v.source, v.carriers != null ? `${v.carriers} of ${v.covered ?? "?"} cells` : null, v.vaf != null ? `VAF ${(100 * v.vaf).toFixed(1)}%` : null].filter(Boolean);
    lines.push(`evidence: ${bits.join(", ")}`);
  });
  if (r.note) lines.push(r.note);
  return lines.join("\n");
}

const shorten = (v) => `${v}`.replace("Unmethylated", "Unmeth.").replace("Methylated", "Meth.").replace("Multi-Focal", "Multifocal");

/**
 * Per-patient clinical annotation strip rows (sex, location, MGMT, primary / recurrent, assay) + numeric rows (age, truncal mutations).
 * Draws at x offset `L`, columns of width `cw`, starting at y. Returns nothing; use inside an <svg>.
 */
export function HeaderStrip({ header, L, cw, y, theme, rowH = 17, showAssay = true }) {
  const catKeys = ["sex", "location", "mgmt", "recurrence"];
  const seen = {};
  catKeys.forEach((k) => {
    seen[k] = [];
    header.forEach((h) => {
      const f = h.fields.find((x) => x.key === k);
      if (f && f.value != null && !seen[k].includes(f.value)) seen[k].push(f.value);
    });
  });
  const rows = [
    ...catKeys.map((k) => ({ key: k, label: header[0]?.fields.find((x) => x.key === k)?.label || k })),
    { key: "age", label: "Age" },
    { key: "truncal", label: "Truncal mutations" },
    { key: "regions", label: "Regions sampled" },
    ...(showAssay ? [{ key: "assay", label: "Clinical assay" }] : []),
  ];
  const assayCol = { ok: theme.ok, failed: theme.danger, "nothing detected": theme.axis, none: theme.empty };
  return (
    <g>
      {rows.map((row, i) => (
        <text key={row.key} x={L - 8} y={y + i * rowH + 12} textAnchor="end" fill={theme.textSecondary} fontSize={TYPE.tick}>{row.label}</text>
      ))}
      {header.map((h, j) => (
        <g key={h.id} transform={`translate(${L + j * cw},0)`}>
          {rows.map((row, i) => {
            const f = h.fields.find((x) => x.key === row.key);
            const yy = y + i * rowH;
            if (row.key === "assay") {
              const label = h.status === "failed" ? "failed" : h.status === "nothing detected" ? "none found" : h.assays.map((a) => a.assay).join(" + ") || "no report";
              return (
                <g key={row.key}>
                  <title>{`${h.id}: ${label}`}</title>
                  <rect x={1} y={yy} width={cw - 2} height={rowH - 2} rx={2} fill={assayCol[h.status] || theme.empty} fillOpacity={h.status === "ok" ? 0.9 : 0.55} />
                  <text x={cw / 2} y={yy + 11} textAnchor="middle" fontSize={TYPE.micro + 0.5} fill={h.status === "ok" || h.status === "failed" ? "#fff" : theme.textSecondary}>{label.slice(0, 14)}</text>
                </g>
              );
            }
            const na = !f || f.value == null;
            const isCat = catKeys.includes(row.key);
            const fill = na ? theme.panelAlt : isCat ? catColor(f.value, seen[row.key]) : theme.accentSoft;
            return (
              <g key={row.key}>
                <title>{na ? `${row.label}: not available (${f?.why || "no data"})` : `${row.label}: ${f.value}${f.sub ? ` (${f.sub})` : ""}${f.tip ? `\n${f.tip}` : ""}`}</title>
                <rect x={1} y={yy} width={cw - 2} height={rowH - 2} rx={2} fill={fill} stroke={na ? theme.borderSoft : "none"} />
                <text x={cw / 2} y={yy + 11} textAnchor="middle" fontSize={TYPE.micro + 0.5} fill={na ? theme.muted : isCat ? "#fff" : theme.text}>{na ? "n/a" : shorten(f.value).slice(0, 14)}</text>
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}
export const headerHeight = (showAssay = true, rowH = 17) => (7 + (showAssay ? 1 : 0)) * rowH;

/**
 * Concordance oncoprint: genes x patients. `grid` from clinicalOncoprint(); `header` from clinicalHeader().
 * `hrefOf(patient, entry)` optional link. Per-patient stacked recovery bars sit between header and grid.
 */
export function ClinicalOncoprint({ grid, header, bars, width, theme, hrefOf, onPatient }) {
  const L = 150;
  const cw = Math.max(56, Math.min(96, (width - L - 10) / Math.max(1, grid.patients.length)));
  const rh = 24;
  const rowH = 17;
  const hdrH = headerHeight(true, rowH);
  const idY = 18;
  const hdrY = idY + 8;
  const barTop = hdrY + hdrH + 12;
  const barH = 44;
  const gridTop = barTop + barH + 30;
  const list = withHeaders(grid.rows);
  const H = gridTop + list.length * rh + 10;
  const W = L + cw * grid.patients.length + 10;
  const col = statusFill(theme);
  const maxTotal = Math.max(1, ...bars.byPatient.map((b) => b.total));
  const barOf = (id) => bars.byPatient.find((b) => b.id === id);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} style={{ display: "block", fontSize: TYPE.tick }} role="img" aria-label="Concordance oncoprint of clinical alterations by patient">
        {grid.patients.map((p, j) => (
          <text key={p.id} x={L + j * cw + cw / 2} y={idY} textAnchor="middle" fill={theme.text} fontWeight={600} fontSize={TYPE.label} style={{ cursor: onPatient ? "pointer" : "default" }} onClick={() => onPatient && onPatient(p.id)}>{p.id}</text>
        ))}
        <HeaderStrip header={header} L={L} cw={cw} y={hdrY} theme={theme} rowH={rowH} />
        <text x={L - 8} y={barTop + barH / 2 + 4} textAnchor="end" fill={theme.textSecondary}>Reported alterations</text>
        {grid.patients.map((p, j) => {
          const b = barOf(p.id);
          if (!b || !b.total) return <text key={p.id} x={L + j * cw + cw / 2} y={barTop + barH - 4} textAnchor="middle" fill={theme.muted} fontSize={TYPE.micro + 0.5}>none</text>;
          let y0 = barTop + barH;
          const h = (b.total / maxTotal) * barH;
          return (
            <g key={p.id} transform={`translate(${L + j * cw},0)`}>
              <title>{`${p.id}: ${ONCO_STATUS.filter((s) => b.counts[s]).map((s) => `${b.counts[s]} ${ONCO_STATUS_LABEL[s].toLowerCase()}`).join(", ")}`}</title>
              {ONCO_STATUS.map((s) => {
                const sh = (b.counts[s] / b.total) * h;
                if (!sh) return null;
                y0 -= sh;
                return <rect key={s} x={cw * 0.22} y={y0} width={cw * 0.56} height={sh} fill={s === "germline_like" ? theme.panel : col[s]} stroke={s === "germline_like" ? theme.text : "none"} />;
              })}
              <text x={cw / 2} y={barTop + barH - h - 3} textAnchor="middle" fill={theme.textSecondary} fontSize={TYPE.micro + 0.5}>{b.total}</text>
            </g>
          );
        })}
        <g transform={`translate(0,${gridTop})`}>
          {list.map((it, i) => {
            if (it.header) {
              return (
                <g key={it.header} transform={`translate(0,${i * rh})`}>
                  <rect x={0} y={2} width={W} height={rh - 4} fill={theme.band} />
                  <text x={6} y={rh / 2 + 4} fill={theme.textSecondary} fontWeight={600}>{`${it.header} (${it.n})`}</text>
                </g>
              );
            }
            const row = it.row;
            return (
              <g key={row.key} transform={`translate(0,${i * rh})`}>
                <text x={L - 8} y={rh / 2 + 4} textAnchor="end" fill={theme.text}>{row.gene.length > 22 ? `${row.gene.slice(0, 21)}…` : row.gene}<title>{`${row.gene}: reported in ${row.nPatients} patient(s)`}</title></text>
                {grid.patients.map((p, j) => {
                  const ents = row.cells[p.id];
                  const x0 = L + j * cw;
                  if (!ents) return <rect key={p.id} x={x0 + 1} y={1} width={cw - 2} height={rh - 2} fill="none" stroke={theme.borderSoft} rx={2} />;
                  const slots = Math.min(3, ents.length);
                  const body = (
                    <g>
                      <rect x={x0 + 1} y={1} width={cw - 2} height={rh - 2} fill={theme.panelAlt} stroke={theme.borderSoft} rx={2} />
                      {ents.slice(0, 3).map((e, k) => (
                        <g key={k}>
                          <title>{entryTip(p.id, e)}</title>
                          <ClassGlyph cls={e.cls} cx={x0 + (cw / slots) * (k + 0.5)} cy={rh / 2} r={Math.min(8, cw / slots / 2 - 2)} status={e.status} theme={theme} />
                        </g>
                      ))}
                    </g>
                  );
                  const href = hrefOf && hrefOf(p.id, ents[0]);
                  return href ? <a key={p.id} href={href}>{body}</a> : <g key={p.id}>{body}</g>;
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** Horizontal stacked bars: rows [{ label, counts, total }] by recovery status. */
export function StackedRows({ rows, width, theme, title }) {
  const L = 140;
  const rh = 22;
  const col = statusFill(theme);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const W = Math.max(240, width);
  return (
    <svg width={W} height={rows.length * rh + 8} style={{ display: "block", fontSize: TYPE.tick }} role="img" aria-label={title}>
      {rows.map((r, i) => {
        let x = L;
        return (
          <g key={r.label} transform={`translate(0,${i * rh + 4})`}>
            <text x={L - 8} y={13} textAnchor="end" fill={theme.text}>{r.label}</text>
            {ONCO_STATUS.map((s) => {
              const w = (r.counts[s] / max) * (W - L - 40);
              if (!w) return null;
              const rect = (
                <g key={s}>
                  <title>{`${r.label}: ${r.counts[s]} ${ONCO_STATUS_LABEL[s].toLowerCase()}`}</title>
                  <rect x={x} y={1} width={w} height={rh - 6} fill={s === "germline_like" ? theme.panel : col[s]} stroke={s === "germline_like" ? theme.text : theme.panel} />
                </g>
              );
              x += w;
              return rect;
            })}
            <text x={x + 5} y={13} fill={theme.textSecondary}>{r.total}</text>
          </g>
        );
      })}
    </svg>
  );
}
