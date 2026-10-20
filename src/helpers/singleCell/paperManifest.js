// "Interactive paper": the built manuscript figures (exact SVG / PNG output of the figure scripts) with
// their manifest (gos-sc-paper-figures/1, written by srctools inst/paper_figures/sync_gos.py), and the
// link from each panel to its interactive view. d3-free so it can be unit tested and reused by other papers.

export const PAPER_FIGURES_DIR = "paper_figures";
export const PAPER_MANIFEST_FILE = `${PAPER_FIGURES_DIR}/manifest.json`;

const STATUS = { ready: "ready", partial: "partial", na: "not available", "n/a": "not available", "not available": "not available", incomplete: "partial" };

/** Normalised panel status: ready | partial | not available | unknown. */
export const panelStatus = (s) => STATUS[`${s ?? ""}`.trim().toLowerCase()] || (s ? `${s}` : "unknown");

/** Figure group for the picker: main, supplementary (S...), extra (V...). */
export function figureGroup(id) {
  const s = `${id}`.replace(/^Figure/i, "");
  if (/^S/i.test(s)) return "supplementary";
  if (/^V/i.test(s)) return "extra";
  return "main";
}

/** Short label: Figure4 -> "Fig 4", FigureS1 -> "Fig S1", FigureV2_ecdna_new -> "Fig V2". */
export function figureLabel(id) {
  const m = /^Figure([A-Z]?\d+)/i.exec(`${id}`);
  return m ? `Fig ${m[1]}` : `${id}`;
}

/**
 * Manifest -> { synced, srctools, figures: [{ id, label, title, group, svg, png, pdf, widthPt, heightPt, built, panels, nIncomplete }] }
 * with file paths resolved against `base` (the URL of the paper_figures directory, ending in "/"). Null when unusable.
 */
export function parsePaperManifest(json, base = "") {
  if (!json || typeof json !== "object" || !Array.isArray(json.figures)) return null;
  const url = (rel) => (rel ? `${base}${rel}` : null);
  const figures = json.figures
    .filter((f) => f && f.id)
    .map((f) => {
      const panels = (Array.isArray(f.panels) ? f.panels : []).map((p) => ({
        letter: `${p.letter}`,
        status: panelStatus(p.status),
        reason: p.reason || "",
        source: p.source || "",
        svg: url(p.svg),
        png: url(p.png),
        pdf: url(p.pdf),
        view: p.view && typeof p.view === "object" ? p.view : null,
      }));
      return {
        id: `${f.id}`,
        label: figureLabel(f.id),
        title: f.title || `${f.id}`,
        group: figureGroup(f.id),
        svg: url(f.svg),
        png: url(f.png),
        pdf: url(f.pdf),
        widthPt: Number(f.width_pt) || null,
        heightPt: Number(f.height_pt) || null,
        built: f.built || null,
        panels,
        nIncomplete: panels.filter((p) => p.status !== "ready").length,
      };
    });
  return { synced: json.synced || null, srctools: json.srctools || null, figures };
}

/** The image to show for a figure / panel: SVG when present, else PNG. */
export const bestImage = (x) => (x ? x.svg || x.png || null : null);

/** "2026-10-19T23:45:05" -> "2026-10-19 23:45" (no time-zone shifting: the build machine's local time). */
export function formatBuilt(iso) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(`${iso ?? ""}`);
  return m ? `${m[1]} ${m[2]}` : iso ? `${iso}` : "unknown";
}

/**
 * Where a panel's interactive counterpart lives: { kind: "interactive", panel, patient } (the Interactive mode
 * of this view), { kind: "scview", scview } (another cohort view) or { kind: "tab", patient, tab }; null when none.
 */
export function panelTarget(view) {
  if (!view) return null;
  if (view.panel) return { kind: "interactive", panel: `${view.panel}`, patient: view.patient ? `${view.patient}` : null, label: view.label || null };
  if (view.scview) return { kind: "scview", scview: `${view.scview}`, label: view.label || null };
  if (view.tab != null && view.patient) return { kind: "tab", patient: `${view.patient}`, tab: `${view.tab}`, label: view.label || null };
  return null;
}

/** Query string for a target, keeping the dataset (and other params) of `search`. */
export function targetSearch(target, search = "") {
  const p = new URLSearchParams(search);
  ["figmode", "figpatient", "figpanel", "figwalk", "figlayout", "scview", "report", "tab"].forEach((k) => p.delete(k));
  if (target.kind === "interactive") {
    p.set("scview", "figures");
    p.set("figmode", "interactive");
    p.set("figpanel", target.panel);
    if (target.patient) p.set("figpatient", target.patient);
  } else if (target.kind === "scview") p.set("scview", target.scview);
  else if (target.kind === "tab") {
    p.set("report", target.patient);
    p.set("tab", target.tab);
  }
  return `?${p.toString()}`;
}

// ---- zoom / pan of the whole-figure view (scale about a point, clamped)
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 12;

/** New { k, x, y } after zooming by `factor` about the viewport point (px, py); translation keeps that point fixed. */
export function zoomAt(view, factor, px, py, { min = ZOOM_MIN, max = ZOOM_MAX } = {}) {
  const k = Math.min(max, Math.max(min, view.k * factor));
  const f = k / view.k;
  return { k, x: px - (px - view.x) * f, y: py - (py - view.y) * f };
}

/** Scale and offset that fit content (w x h) inside a viewport (vw x vh), centred. */
export function fitView(w, h, vw, vh, pad = 8) {
  if (!(w > 0 && h > 0 && vw > 0 && vh > 0)) return { k: 1, x: 0, y: 0 };
  const k = Math.min((vw - 2 * pad) / w, (vh - 2 * pad) / h);
  return { k, x: (vw - w * k) / 2, y: (vh - h * k) / 2 };
}
