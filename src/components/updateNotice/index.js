import { useEffect } from "react";
import { Button, notification } from "antd";

const INTERVAL = 60 * 1000;

/** Which main bundle this page is running. */
const runningMain = () => {
  const script = [...document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src")).find((src) => /static\/js\/main\.[a-z0-9]+\.js/.test(src || ""));
  return script ? script.replace(/^.*static\/js\//, "static/js/") : null;
};

/**
 * Polls the deployed asset manifest; when a newer main bundle is live than
 * the one loaded here, offers a reload (browsers otherwise keep the cached
 * index.html for a while after a deploy).
 */
export default function UpdateNotice() {
  useEffect(() => {
    const current = runningMain();
    if (!current) return undefined;
    let shown = false;
    const base = window.location.href.split("?")[0].replace(/\/[^/]*$/, "");
    const check = async () => {
      try {
        const r = await fetch(`${base}/asset-manifest.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const manifest = await r.json();
        const latest = `${manifest?.files?.["main.js"] || ""}`.replace(/^.*static\/js\//, "static/js/");
        if (latest && latest !== current && !shown) {
          shown = true;
          notification.info({
            key: "gos-update",
            message: "A newer gOS build is available",
            description: "Reload to pick up the latest changes (your layout settings are kept).",
            duration: 0,
            btn: (
              <Button type="primary" size="small" onClick={() => window.location.reload()}>
                Reload
              </Button>
            ),
          });
        }
      } catch (error) {
        // offline or no manifest: try again later
      }
    };
    const timer = setInterval(check, INTERVAL);
    const first = setTimeout(check, 5000);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, []);
  return null;
}
