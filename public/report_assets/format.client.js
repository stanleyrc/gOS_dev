/* Browser-safe shared formatting helpers for the HTML report client */
(function () {
  'use strict';
  var F = window.__gosFmt__ || {};

  function parseNum(val) {
    var s = (val == null ? '' : String(val)).replace(/[^\d.+-]/g, '');
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function asNumber(val) {
    var n = (typeof val === 'number') ? val : Number(val);
    return isFinite(n) ? n : null;
  }
  function toPercentString(val) {
    if (val == null || val === '') return '';
    var n = parseNum(val);
    if (n == null) return String(val);
    if (n > 0 && n <= 1) n *= 100;
    var digits = n < 10 ? 1 : 0;
    return n.toFixed(digits) + '%';
  }
  function formatCoveragePair(tumor, normal) {
    var t = parseNum(tumor);
    var n = parseNum(normal);
    var tStr = (t != null) ? (t + 'X') : '—';
    var nStr = (n != null) ? (n + 'X') : '—';
    return tStr + '/' + nStr;
  }
  function normalizeAlterationType(s) {
    var t = String(s || '').trim().toLowerCase();
    if (!t) return '';
    if (/hom(oz)?del|homozygous\s+del(eti(on)?)?/.test(t)) return 'homdel';
    if (/\bamp(lification)?\b/.test(t)) return 'amp';
    if (/\bmissense\b/.test(t)) return 'mutation';
    if (/\btrunc(ation)?\b/.test(t)) return 'mutation';
    if (/\bdel(eti(on)?)?\b/.test(t)) return 'del';
    if (/\bgain\b/.test(t)) return 'gain';
    if (/\bloss\b/.test(t)) return 'loss';
    if (/\bfusion|rearrang(e|ement)s?\b/.test(t)) return 'fusion';
    if (/\bmutation|mutant|\bmut\b/.test(t)) return 'mutation';
    if (/\bcnv\b/.test(t)) return 'cnv';
    return t;
  }
  function tagClassForType(type) {
    var t = normalizeAlterationType(type);
    var known = ['amp','homdel','del','gain','loss','fusion','mutation','rearrangement','cnv'];
    return 'tag-' + (known.indexOf(t) >= 0 ? t : 'default');
  }
  function splitPillsList(s) {
    return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function normalizePmId(item) {
    if (item == null) return '';
    if (typeof item === 'number') return String(item);
    if (typeof item === 'string') {
      var m = item.match(/\b(\d{1,10})\b/);
      return m ? m[1] : '';
    }
    var id = item.pmid || item.PMID || item.uid || item.id || item.Id;
    return id ? normalizePmId(String(id)) : '';
  }
  function pmidToUrl(id) {
    var pmid = normalizePmId(id);
    return pmid ? ('https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/') : '';
  }

  F.parseNum = F.parseNum || parseNum;
  F.asNumber = F.asNumber || asNumber;
  F.toPercentString = F.toPercentString || toPercentString;
  F.formatCoveragePair = F.formatCoveragePair || formatCoveragePair;
  F.normalizeAlterationType = F.normalizeAlterationType || normalizeAlterationType;
  F.tagClassForType = F.tagClassForType || tagClassForType;
  F.splitPillsList = F.splitPillsList || splitPillsList;
  F.normalizePmId = F.normalizePmId || normalizePmId;
  F.pmidToUrl = F.pmidToUrl || pmidToUrl;

  window.__gosFmt__ = F;
})();
