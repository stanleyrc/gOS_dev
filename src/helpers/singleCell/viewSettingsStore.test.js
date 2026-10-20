import {
  SC_LAYOUT_SCHEMA_VERSION, readPref, writePref, readLayout, writeLayout, savingEnabled, setSavingEnabled,
  scopedKey, savedLayoutDiffers, takeDroppedNotice, resetSavedView, currentUserId,
} from "./viewSettingsStore";

const mem = () => {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
};
const signIn = (s, id = "u1") => s.setItem("gOS_user", JSON.stringify({ userId: id, displayName: "x" }));
const K = "gos.singleCell.layout";

test("off by default: nothing read or written, old keys ignored but not deleted", () => {
  const s = mem();
  s.setItem(K, JSON.stringify({ a: 1 }));
  expect(readPref(K, s)).toBeNull();
  expect(writePref(K, "{}", s)).toBe(false);
  expect(s.getItem(K)).toBe(JSON.stringify({ a: 1 }));
  signIn(s);
  expect(savingEnabled(s)).toBe(false);
  expect(writeLayout(K, { a: 2 }, s)).toBe(false);
  expect(readLayout(K, s)).toBeNull();
});

test("signed out cannot enable; theme and cell labels stay remembered", () => {
  const s = mem();
  expect(setSavingEnabled(true, s)).toBe(false);
  expect(writePref("gos-theme", "dark", s)).toBe(true);
  expect(readPref("gos-theme", s)).toBe("dark");
});

test("on: per-user keys, users do not mix", () => {
  const s = mem();
  signIn(s, "u1");
  setSavingEnabled(true, s);
  expect(writeLayout(K, { a: 2 }, s)).toBe(true);
  expect(s.getItem(scopedKey("u1", K))).toBeTruthy();
  expect(s.getItem(K)).toBeNull();
  expect(readLayout(K, s)).toEqual({ a: 2 });
  signIn(s, "u2");
  expect(savingEnabled(s)).toBe(false);
  expect(readLayout(K, s)).toBeNull();
});

test("sign-out returns to defaults", () => {
  const s = mem();
  signIn(s);
  setSavingEnabled(true, s);
  writeLayout(K, { a: 2 }, s);
  s.removeItem("gOS_user");
  expect(currentUserId(s)).toBeNull();
  expect(readLayout(K, s)).toBeNull();
});

test("older schema version is dropped once with a notice", () => {
  const s = mem();
  signIn(s);
  setSavingEnabled(true, s);
  s.setItem(scopedKey("u1", K), JSON.stringify({ a: 2, __v: SC_LAYOUT_SCHEMA_VERSION - 1 }));
  expect(readLayout(K, s)).toBeNull();
  expect(s.getItem(scopedKey("u1", K))).toBeNull();
  expect(takeDroppedNotice(s)).toBe(true);
  expect(takeDroppedNotice(s)).toBe(false);
});

test("differs-from-defaults chip data and reset", () => {
  const s = mem();
  signIn(s);
  setSavingEnabled(true, s);
  writeLayout(K, { a: 1, b: 3 }, s);
  expect(savedLayoutDiffers(K, { a: 1, b: 2 }, s)).toEqual(["b"]);
  expect(savedLayoutDiffers(K, { a: 1, b: 3 }, s)).toEqual([]);
  resetSavedView([K], s);
  expect(savedLayoutDiffers(K, { a: 1, b: 2 }, s)).toEqual([]);
  expect(savingEnabled(s)).toBe(true);
});

test("URL parameters still win: the store returns null (defaults) and never reads the URL", () => {
  // the reducer layers withUrlGroups / readViewLink on top of whatever the store returns
  expect(readLayout(K, mem())).toBeNull();
});
