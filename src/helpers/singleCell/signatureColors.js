// Shared COSMIC colours, independent of which patient or view renders first.
import metadata from "../../translations/en/signatures.json";
import { themePalette } from "./themes";

const names = Object.keys(metadata.metadata || {}).filter((s) => /^SBS\d+[a-z]*$/.test(s)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const tail = ["#8dd3c7", "#ffffb3", "#bebada", "#fb8072", "#80b1d3", "#fdb462", "#b3de69", "#fccde5", "#d9d9d9", "#bc80bd", "#ccebc5", "#ffed6f", "#fbb4ae", "#b3cde3", "#ccebc5", "#decbe4", "#fed9a6", "#ffffcc", "#e5d8bd", "#fddaec", "#f2f2f2"];
export function signatureColor(sig, theme = "tableau") {
  const colors = [...themePalette(theme), ...tail];
  const known = names.indexOf(sig);
  const hash = [...String(sig)].reduce((n, c) => ((n * 31 + c.charCodeAt(0)) >>> 0), 0);
  return colors[(known >= 0 ? known : hash) % colors.length];
}
