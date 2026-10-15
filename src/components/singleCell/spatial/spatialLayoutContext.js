import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Col } from "antd";
import { DownOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import {
  SPATIAL_SECTIONS, clampMapWidth, effectiveMode, hiddenSections, isCompact, readSpatialLink, toggleSection, withSpatialLink,
} from "../../../helpers/singleCell/spatialLayout";

const INACTIVE = { active: false, mode: "below", hidden: [] };
const SpatialLayoutContext = createContext(INACTIVE);
export const SpatialLayoutProvider = SpatialLayoutContext.Provider;
export const useSpatialLayout = () => useContext(SpatialLayoutContext);

const viewportWidth = () => (typeof window === "undefined" ? 1920 : window.innerWidth);

/**
 * Slide-tag layout state (layout.spMap / spWidth / spHidden, mirrored in the URL
 * as ?spmap= &spw= &sphide=). `active` is false for patients without spatial.json,
 * which leaves every card as it was.
 */
export function useSpatialLayoutState(hasSpatial) {
  const dispatch = useDispatch();
  const layout = useSelector((s) => s.SingleCell.layout);
  const [viewport, setViewport] = useState(viewportWidth);
  useEffect(() => {
    const onResize = () => setViewport(viewportWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // a link carrying spmap / spw / sphide wins over the stored layout, once
  useEffect(() => {
    try {
      const patch = readSpatialLink(window.location.search);
      if (Object.keys(patch).length) dispatch(singleCellActions.updateLayout(patch));
    } catch (error) {
      // no window
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requested = layout.spMap === "below" ? "below" : "beside";
  const mode = effectiveMode(requested, viewport);
  const hidden = hiddenSections(layout.spHidden, mode);
  const width = clampMapWidth(layout.spWidth, viewport - 80);

  const update = useCallback(
    (patch) => {
      dispatch(singleCellActions.updateLayout(patch));
      try {
        const next = { spMap: requested, spWidth: width, spHidden: layout.spHidden, ...patch };
        const search = withSpatialLink(window.location.search, next);
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
      } catch (error) {
        // URL not writable: the layout still applies
      }
    },
    [dispatch, requested, width, layout.spHidden]
  );

  return {
    active: Boolean(hasSpatial),
    mode: hasSpatial ? mode : "below",
    requested,
    viewport,
    width,
    hidden: hasSpatial ? hidden : [],
    compact: isCompact(hidden),
    setMode: (m) => update({ spMap: m }),
    setWidth: (w) => update({ spWidth: clampMapWidth(w, viewport - 80) }),
    setCompact: (on) => update({ spHidden: on ? [...SPATIAL_SECTIONS] : [] }),
    toggle: (key) => update({ spHidden: toggleSection(hidden, key) }),
  };
}

const TITLES = {
  nav: "gene navigation",
  igv: "IGV reads",
  umap: "UMAP",
  treebars: "tree bars",
  tracks: "cell tracks",
  headline: "spatial summary",
  legend: "legend and notes",
  clustering: "clone clustering",
  enrichment: "neighbourhood enrichment",
  niche: "niche table",
  mantel: "Mantel (tree vs space)",
  notes: "notes",
};
export const sectionTitle = (key) => TITLES[key] || key;

/**
 * A card or block that can be hidden. Hidden: renders nothing (the toggles row
 * lists everything hidden). Shown: a slim "Hide" strip on top. Without slide-tag
 * data it is transparent.
 */
export function SpatialSection({ k, children, strip = true, col = false }) {
  const { active, hidden, toggle } = useSpatialLayout();
  const wrap = (node) => (col ? <Col span={24}>{node}</Col> : node);
  if (!active) return wrap(children);
  if (hidden.includes(k)) return null;
  return wrap(
    <div className="sc-sp-section" data-testid={`sp-section-${k}`}>
      {strip && (
        <div style={{ textAlign: "right", lineHeight: "16px" }}>
          <Button type="link" size="small" style={{ height: 16, padding: 0, fontSize: 11 }} onClick={() => toggle(k)} icon={<DownOutlined style={{ fontSize: 9 }} />}>
            {`Hide ${sectionTitle(k)}`}
          </Button>
        </div>
      )}
      {children}
    </div>
  );
}

