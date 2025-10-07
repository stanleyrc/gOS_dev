'use strict';

import axios from 'axios';

const CSS_URL = 'report_assets/styles.css';
const CLIENT_JS_URL = 'report_assets/html_client.js';
const FORMAT_JS_URL = 'report_assets/format.client.js';

const ICON_PATHS = {
  'android-chrome-192x192.png': 'android-chrome-192x192.png',
  'android-chrome-512x512.png': 'android-chrome-512x512.png',
  'apple-touch-icon.png': 'apple-touch-icon.png',
  'favicon-32x32.png': 'favicon-32x32.png',
  'favicon-16x16.png': 'favicon-16x16.png',
  'mstile-150x150.png': 'mstile-150x150.png',
};

// Resolve asset URLs under PUBLIC_URL (prod) or <base href> if set.
const PUBLIC_BASE = (
  ((typeof process !== 'undefined' && process.env && process.env.PUBLIC_URL) || '') ||
  ((typeof document !== 'undefined' &&
    document.querySelector('base[href]') &&
    document.querySelector('base[href]').getAttribute('href')) || '')
).replace(/\/+$/, '');

function assetUrl(relOrAbsPath) {
  const p = String(relOrAbsPath || '');
  if (/^(https?:)?\/\//i.test(p) || /^data:/i.test(p)) return p;
  const clean = p.replace(/^\/+/, '');
  return PUBLIC_BASE ? `${PUBLIC_BASE}/${clean}` : `${clean}`;
}

async function fetchText(url) {
  try {
    const res = await axios.get(assetUrl(url), {
      withCredentials: true,
      transformResponse: [(d) => d], // prevent JSON parsing
    });
    return typeof res.data === 'string' ? res.data : String(res.data ?? '');
  } catch {
    return '';
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

async function fetchDataUrl(url) {
  try {
    const res = await axios.get(assetUrl(url), {
      withCredentials: true,
      responseType: 'blob',
    });
    return await blobToDataUrl(res.data);
  } catch {
    return '';
  }
}

/**
 * Loads assets from public/ and returns options for HtmlRenderer.
 * Returns:
 *  {
 *    inlineCss, inlineClientJs, inlineFormatJs,
 *    iconDataUrls: { [filename]: dataUrl },
 *    logoDataUrl
 *  }
 */
export async function loadInlineReportAssets({ includeIcons = true, logoPath } = {}) {
  const [css, clientJs, formatJs] = await Promise.all([
    fetchText(CSS_URL),
    fetchText(CLIENT_JS_URL),
    fetchText(FORMAT_JS_URL),
  ]);

  const iconDataUrls = {};
  if (includeIcons) {
    await Promise.all(
      Object.entries(ICON_PATHS).map(async ([name, path]) => {
        const data = await fetchDataUrl(path);
        if (data) iconDataUrls[name] = data;
      })
    );
  }

  let logoDataUrl = '';
  const lp = logoPath || ICON_PATHS['android-chrome-192x192.png'];
  if (lp) {
    logoDataUrl = await fetchDataUrl(lp);
  }

  return {
    inlineCss: css,
    inlineClientJs: clientJs,
    inlineFormatJs: formatJs || '',
    iconDataUrls,
    logoDataUrl,
  };
}
