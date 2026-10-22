import { createPopupController } from "./hoverPopup";

const make = (graceMs = 300) => {
  let t = 0;
  const timers = new Map();
  const log = [];
  const c = createPopupController({
    graceMs,
    onChange: (s) => log.push(s && `${s.key}${s.pinned ? "*" : ""}`),
    setTimer: (fn) => {
      timers.set(++t, fn);
      return t;
    },
    clearTimer: (id) => timers.delete(id),
  });
  return { c, log, fire: () => [...timers.values()].forEach((f) => f()) || timers.clear(), pending: () => timers.size };
};

test("hover opens and leaving closes after the grace delay", () => {
  const { c, fire, pending } = make();
  c.hoverRegion("a", {});
  expect(c.get().key).toBe("a");
  c.leaveRegion();
  expect(pending()).toBe(1);
  expect(c.get()).not.toBeNull();
  fire();
  expect(c.get()).toBeNull();
});

test("entering the popup cancels the close; leaving it restarts the delay", () => {
  const { c, fire, pending } = make();
  c.hoverRegion("a");
  c.leaveRegion();
  c.enterPopup();
  expect(pending()).toBe(0);
  c.leavePopup();
  fire();
  expect(c.get()).toBeNull();
});

test("hovering another region switches the popup", () => {
  const { c } = make();
  c.hoverRegion("a");
  c.hoverRegion("b");
  expect(c.get().key).toBe("b");
});

test("Escape, scroll and click-outside close an unpinned popup", () => {
  const { c } = make();
  ["escape", "scroll", "clickOutside"].forEach((m) => {
    c.hoverRegion("a");
    c[m]();
    expect(c.get()).toBeNull();
  });
});

test("a pinned popup survives leave, scroll, click-outside and hover elsewhere; Escape closes it", () => {
  const { c, pending } = make();
  c.hoverRegion("a");
  c.pin();
  c.leaveRegion();
  c.leavePopup();
  c.scroll();
  c.clickOutside();
  c.hoverRegion("b");
  expect(pending()).toBe(0);
  expect(c.get()).toMatchObject({ key: "a", pinned: true });
  c.escape();
  expect(c.get()).toBeNull();
});

test("an explicit open replaces a pinned popup", () => {
  const { c } = make();
  c.open("a", null, true);
  c.open("b");
  expect(c.get()).toMatchObject({ key: "b", pinned: false });
});

test("re-hovering the same region keeps one popup and cancels a pending close", () => {
  const { c, log, fire } = make();
  c.hoverRegion("a");
  c.leaveRegion();
  c.hoverRegion("a");
  fire();
  expect(c.get().key).toBe("a");
  expect(log).toEqual(["a"]);
});
