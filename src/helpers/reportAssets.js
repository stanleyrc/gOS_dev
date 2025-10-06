'use strict';

const CSS_URL = '/report_assets/styles.css';
const CLIENT_JS_URL = '/report_assets/html_client.js';
const FORMAT_JS_URL = '/report_assets/format.client.js';

const ICON_PATHS = {
  'android-chrome-192x192.png': '/android-chrome-192x192.png',
  'android-chrome-512x512.png': '/android-chrome-512x512.png',
  'apple-touch-icon.png': '/apple-touch-icon.png',
  'favicon-32x32.png': '/favicon-32x32.png',
  'favicon-16x16.png': '/favicon-16x16.png',
  'mstile-150x150.png': '/mstile-150x150.png',
};

async function fetchText(url) {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return '';
    return await res.text();
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
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return '';
    const blob = await res.blob();
    return await blobToDataUrl(blob);
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
