// Which SNV sites (columns) to show, shared by the SNV heatmap and the
// signature panel: by where the site maps on the tree (variant.category), only
// the sites CellPhy built the tree from, only OncoKB driver sites, and a
// minimum clade score (how cleanly the alt calls follow the mapped clade).

/** True when the SNV matrix carries per-site tree categories. */
export const hasSiteCategories = (snv) => Boolean(snv?.variants?.some((v) => v.category));

/** True when the SNV matrix carries clade scores. */
export const hasCladeScores = (snv) => Boolean(snv?.variants?.some((v) => v.cladeScore != null));

/** "alt in clade / clade calls · alt outside / outside calls" for a variant. */
export const cladeScoreDetail = (v) =>
  v.cladeScore == null
    ? null
    : `${v.cladeScore.toFixed(2)} (alt ${v.altInClade}/${v.altInClade + v.refInClade} in clade, ${v.altOutsideClade}/${v.altOutsideClade + v.refOutsideClade} outside)`;

/** Filter column (variant) indices by the layout's SNV site filters. */
export function filterSnvColumns(snv, columns, { snvCategories, snvCellphyOnly, snvDriversOnly, snvSiteIds, snvMinCladeScore } = {}) {
  if (!snv) return columns;
  const categories = hasSiteCategories(snv) && snvCategories?.length ? new Set(snvCategories) : null;
  const sites = snvSiteIds?.length ? new Set(snvSiteIds) : null;
  const minScore = snvMinCladeScore > 0 ? snvMinCladeScore : null;
  if (!categories && !snvCellphyOnly && !snvDriversOnly && !sites && !minScore) return columns;
  return columns.filter((c) => {
    const v = snv.variants[c];
    return (
      (!sites || sites.has(v.id)) &&
      (!categories || categories.has(v.category || "unmapped")) &&
      (!snvCellphyOnly || v.cellphyInput === true) &&
      (!snvDriversOnly || v.driver === true) &&
      (!minScore || (v.cladeScore != null && v.cladeScore >= minScore))
    );
  });
}

/** Variant indices with alt reads in any of the given matrix rows (cells). */
export function sitesSeenInRows(snv, rows) {
  const seen = new Set();
  rows.forEach((p) => {
    const status = snv.status[p];
    if (!status) return;
    for (let c = 0; c < status.length; c += 1) if (status[c] === 1) seen.add(c);
  });
  return seen;
}

/**
 * SNV site id ("chr18_63588822_A_T") of a filtered event, from its Variant_g
 * ("18:63588822-63588822 A>T"); null for anything that is not an SNV.
 */
export function eventSnvSiteId(event) {
  if (`${event?.vartype || ""}`.toUpperCase() !== "SNV") return null;
  const m = /^(?:chr)?([^:]+):(\d+)-\d+\s+([ACGTN]+)>([ACGTN]+)/i.exec(`${event.Variant_g || ""}`);
  return m ? `chr${m[1]}_${m[2]}_${m[3].toUpperCase()}_${m[4].toUpperCase()}` : null;
}
