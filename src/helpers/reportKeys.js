/* Centralized helpers for report anchors and storage keys */
import { slugify } from './format';

export function eventAnchor(gene, variant) {
  const geneLabel = String(gene || '').replace('::', '-').trim();
  const variantTitle = String(variant || '').trim();
  const base = [geneLabel, variantTitle].filter(Boolean).join(' ');
  return slugify(base);
}

export function tierKey(caseId, anchor) {
  const id = String(caseId || '').trim() || 'unknown';
  const a = String(anchor || '').trim();
  return `gos.tier.${id}.${a}`;
}

export function fieldBase(caseId, anchor) {
  const id = String(caseId || '').trim() || 'unknown';
  const a = String(anchor || '').trim();
  return `gos.field.${id}.${a}`;
}
