import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, clampSidebarWidth, readSidebarWidth, writeSidebarWidth } from "./filtersSidebarWidth";

const memory = () => {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => (m[k] = v), removeItem: (k) => delete m[k] };
};

test("clamps widths and falls back to the default", () => {
  expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN_WIDTH);
  expect(clampSidebarWidth(5000)).toBe(SIDEBAR_MAX_WIDTH);
  expect(clampSidebarWidth("abc")).toBe(SIDEBAR_DEFAULT_WIDTH);
});

test("remembers the width; null resets", () => {
  const s = memory();
  expect(readSidebarWidth(s)).toBe(SIDEBAR_DEFAULT_WIDTH);
  expect(writeSidebarWidth(333.4, s)).toBe(333);
  expect(readSidebarWidth(s)).toBe(333);
  expect(writeSidebarWidth(null, s)).toBe(SIDEBAR_DEFAULT_WIDTH);
  expect(readSidebarWidth(s)).toBe(SIDEBAR_DEFAULT_WIDTH);
});
