export function slugify(str) {
  const s = String(str || '').toLowerCase();
  return s
    .replace(/\s+/g, '-')
    .replace(/[:/\\]+/g, '-')
    .replace(/[^a-z0-9\-._]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseNum(val) {
  if (val == null || val === '') return undefined;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const s = String(val).replace(/[^0-9.+-eE]/g, '');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

export function toPercentString(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '';
  const pct = n <= 1 ? n * 100 : n;
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded}%`;
}

export function formatCoveragePair(tumor, normal) {
  const t = Number(tumor);
  const n = Number(normal);
  const fmt = (x) => (Number.isFinite(x) ? Math.round(x) : '');
  if (Number.isFinite(t) && Number.isFinite(n)) return `${fmt(t)}x / ${fmt(n)}x`;
  if (Number.isFinite(t)) return `${fmt(t)}x`;
  if (Number.isFinite(n)) return `${fmt(n)}x`;
  return '';
}

export function normalizeAlterationType(str) {
  const s = String(str || '').trim().toLowerCase();
  if (!s) return '';
  if (/(fusion|rearrang(e|ement))/.test(s)) return 'fusion';
  if (/hom(oz)?del|homozygous\s+del(eti(on)?)?/.test(s)) return 'homdel';
  if (/\bamp(lification)?\b/.test(s)) return 'amp';
  if (/\bdel(eti(on)?)?\b/.test(s)) return 'del';
  if (/\bgain\b/.test(s)) return 'gain';
  if (/\bloss\b/.test(s)) return 'loss';
  if (/\bmissense\b|\btrunc(ation)?\b|mutation|mutant|\bmut\b/.test(s)) return 'mutation';
  return s;
}

export function tagClassForType(type) {
  const t = normalizeAlterationType(type);
  const map = {
    amp: 'tag-amp',
    homdel: 'tag-homdel',
    del: 'tag-del',
    gain: 'tag-gain',
    loss: 'tag-loss',
    mutation: 'tag-mutation',
    fusion: 'tag-fusion',
  };
  return map[t] || 'tag-default';
}

export function splitPillsList(val) {
  if (!val && val !== 0) return [];
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  return String(val)
    .split(/[,;\n|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizePmId(item) {
  if (item == null) return '';
  if (typeof item === 'number') return String(item);
  if (typeof item === 'string') {
    const m = item.match(/\b(\d{1,10})\b/);
    return m ? m[1] : '';
  }
  const id = item.pmid || item.PMID || item.uid || item.id || item.Id;
  return id ? normalizePmId(String(id)) : '';
}

export function pmidToUrl(id) {
  const pmid = normalizePmId(id);
  return pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : '#';
}

export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function linkPmids(text) {
  if (!text) return '';
  const escaped = escapeHtml(String(text));
  const pmidRegex = /(PMID:\s*)([\d,\s]+)/g;
  return escaped.replace(pmidRegex, (match, prefix, pmidString) => {
    const pmids = pmidString.trim().split(/,\s*/).filter(Boolean);
    const links = pmids
      .map((pmid) => {
        const id = normalizePmId(pmid);
        const url = pmidToUrl(id);
        return url
          ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(id)}</a>`
          : escapeHtml(pmid);
      })
      .join(', ');
    return `${prefix}${links}`;
  });
}
