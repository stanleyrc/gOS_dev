import { filtersSidebarVisible, filtersSidebarSpans } from "./filtersSidebar";

test("bulk datasets always show the sidebar", () => {
  expect(filtersSidebarVisible(false, false)).toBe(true);
});
test("single-cell hides by default, opens on toggle", () => {
  expect(filtersSidebarVisible(true, false)).toBe(false);
  expect(filtersSidebarVisible(true, true)).toBe(true);
});
test("spans give content full width when hidden", () => {
  expect(filtersSidebarSpans(false)).toEqual({ sidebar: 0, content: 24 });
  expect(filtersSidebarSpans(true)).toEqual({ sidebar: 4, content: 20 });
});
