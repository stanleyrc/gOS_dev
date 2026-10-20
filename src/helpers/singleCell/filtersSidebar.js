// Search Filters sidebar layout: bulk-gOS leftover, hidden by default on single-cell datasets.
export const filtersSidebarVisible = (isScDataset, userOpen) => !isScDataset || !!userOpen;
export const filtersSidebarSpans = (visible) => (visible ? { sidebar: 4, content: 20 } : { sidebar: 0, content: 24 });
