/** @jest-environment node */
import {
  COLUMN_LAYOUT_STORAGE_KEY,
  normalizeColumnLayout,
  mergeColumnOrder,
  readColumnLayout,
  saveColumnLayout,
} from "./filteredEventsColumnLayout";

const empty = { columnWidths: {}, columnOrderKeys: [] };
const makeStorage = () => {
  const items = new Map();
  return {
    getItem: jest.fn((key) => items.get(key) ?? null),
    setItem: jest.fn((key, value) => items.set(key, value)),
  };
};

describe("browser-wide column layouts", () => {
  it("uses one browser-local key without selecting or merging old user-specific layouts", () => {
    const storage = makeStorage();
    expect(COLUMN_LAYOUT_STORAGE_KEY).toBe("gos.filteredEventsColumnLayout.v1");
    storage.setItem(`${COLUMN_LAYOUT_STORAGE_KEY}.user-a`, JSON.stringify({ columnWidths: { gene: 900 } }));
    expect(readColumnLayout(storage)).toEqual(empty);
    expect(saveColumnLayout({ columnWidths: { gene: 270 } }, storage)).toBe(true);
    expect(readColumnLayout(storage).columnWidths).toEqual({ gene: 270 });
    expect(JSON.parse(storage.getItem(`${COLUMN_LAYOUT_STORAGE_KEY}.user-a`)).columnWidths.gene).toBe(900);
  });

  it.each([null, undefined, [], "bad", 42])("defaults invalid layout %p", (value) => {
    expect(normalizeColumnLayout(value)).toEqual(empty);
  });

  it("keeps only positive finite numeric widths and unique safe string keys", () => {
    const value = JSON.parse('{"columnWidths":{"gene":240,"zero":0,"negative":-2,"text":"200","__proto__":300,"constructor":100},"columnOrderKeys":["gene","gene","",null,3,"tier","__proto__","constructor"]}');
    value.columnWidths.infinite = Infinity;
    expect(normalizeColumnLayout(value)).toEqual({ columnWidths: { gene: 240 }, columnOrderKeys: ["gene", "tier"] });
    expect(normalizeColumnLayout({ columnWidths: [200], columnOrderKeys: {} })).toEqual(empty);
  });

  it("preserves absent dataset columns while merging the currently reordered columns", () => {
    expect(mergeColumnOrder(["gene", "dataset-only", "tier"], ["tier", "gene", "location"]))
      .toEqual(["tier", "dataset-only", "gene", "location"]);
    expect(mergeColumnOrder([], ["tier", "gene"])).toEqual(["tier", "gene"]);
    expect(mergeColumnOrder(["gene", "tier"], [])).toEqual([]);
  });

  it("restores the shared layout and merges edits without overwriting other widths or order", () => {
    const storage = makeStorage();
    expect(readColumnLayout(storage)).toEqual(empty);
    saveColumnLayout({ columnWidths: { gene: 270 }, columnOrderKeys: ["tier", "gene"] }, storage);
    saveColumnLayout({ columnWidths: { tier: 140 } }, storage);
    expect(readColumnLayout(storage)).toEqual({ columnWidths: { gene: 270, tier: 140 }, columnOrderKeys: ["tier", "gene"] });
    saveColumnLayout({ columnOrderKeys: [] }, storage);
    expect(readColumnLayout(storage)).toEqual({ columnWidths: { gene: 270, tier: 140 }, columnOrderKeys: [] });
  });

  it("handles corrupt JSON and disabled storage without throwing", () => {
    const storage = makeStorage();
    storage.setItem(COLUMN_LAYOUT_STORAGE_KEY, "{bad");
    expect(readColumnLayout(storage)).toEqual(empty);
    const unavailable = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("full"); },
    };
    expect(readColumnLayout(unavailable)).toEqual(empty);
    expect(saveColumnLayout(empty, unavailable)).toBe(false);
    expect(readColumnLayout(null)).toEqual(empty);
    expect(saveColumnLayout(empty, null)).toBe(false);
  });

  it("handles a blocked localStorage getter", () => {
    const previous = global.window;
    global.window = Object.defineProperty({}, "localStorage", { get() { throw new Error("denied"); } });
    try {
      expect(readColumnLayout()).toEqual(empty);
      expect(saveColumnLayout(empty)).toBe(false);
    } finally {
      global.window = previous;
    }
  });
});
