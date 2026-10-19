import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Drawer, Tooltip } from "antd";
import * as Icons from "@ant-design/icons";
import { getDetailTabAvailability } from "../../../helpers/detailTabAvailability";
import { isPatientRecord } from "../../../helpers/singleCell/cellFiles";
import { COHORT_VIEWS, COHORT_VIEW_GROUPS } from "../../../helpers/singleCell/cohortViews";
import { announceCohortView, currentCohortView, requestHelpTarget, subscribeCohortView, openHelpCenter } from "../../../helpers/singleCell/helpNav";
import { HOVER_CLOSE_MS, HOVER_OPEN_MS, PATIENT_RAIL, RAIL_WIDTH, cohortGroupOfView, cohortRail, firstEnabledItem, isPhoneWidth, patientGroupOfTab, railContext } from "../../../helpers/singleCell/navRail";
import settingsActions from "../../../redux/settings/actions";

const GROUP_ICON = { findings: "StarOutlined", genome: "RadarChartOutlined", evolution: "ApartmentOutlined", rna: "DotChartOutlined", explore: "SearchOutlined", guide: "ReadOutlined" };
const Icon = ({ name }) => {
  const C = Icons[name] || Icons.AppstoreOutlined;
  return <C />;
};
const useWidth = () => {
  const [w, setW] = useState(typeof window === "undefined" ? 1700 : window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
};

/**
 * Always-on slim rail on the single-cell pages (patient and cohort): one icon per group with the current one
 * highlighted; hover (or focus) expands an overlay with the pages of every group and a one-line description each;
 * click navigates. The page shifts right by the rail width (body.sc-rail-on, see global.css), the expanded panel
 * overlays the content. At phone width the rail collapses to a floating button that opens the same list in a drawer.
 */
export default function NavRail() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const report = useSelector((s) => s.Settings.report);
  const tab = useSelector((s) => s.Settings.tab);
  const availability = useSelector(getDetailTabAvailability);
  const datafiles = useSelector((s) => s.CaseReports.datafiles);
  const hasCohort = useMemo(() => (datafiles || []).some(isPatientRecord), [datafiles]);
  const ctx = railContext({ report, singleCellTabAvailable: availability[7] === true, hasCohort });
  const width = useWidth();
  const phone = isPhoneWidth(width);
  const [open, setOpenState] = useState(false);
  // Hover intent: open only after the pointer rests on the rail, close with a short grace period, and stay closed after a
  // click until the pointer leaves (a click hid the panel under the cursor and it reopened or swallowed the next click).
  const timer = useRef(null);
  const suppress = useRef(false);
  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const setOpen = (v) => { clearTimer(); if (!v) suppress.current = true; setOpenState(v); };
  const hoverOpen = () => { if (suppress.current) return; clearTimer(); timer.current = setTimeout(() => setOpenState(true), HOVER_OPEN_MS); };
  const hoverClose = () => { suppress.current = false; clearTimer(); timer.current = setTimeout(() => setOpenState(false), HOVER_CLOSE_MS); };
  useEffect(() => clearTimer, []);
  const [view, setView] = useState(currentCohortView());
  useEffect(() => subscribeCohortView(setView), []);

  useEffect(() => {
    const on = ctx && !phone;
    document.body.classList.toggle("sc-rail-on", !!on);
    document.body.style.setProperty("--sc-rail-width", `${RAIL_WIDTH}px`);
    return () => document.body.classList.remove("sc-rail-on");
  }, [ctx, phone]);

  const cohortGroups = useMemo(() => cohortRail(COHORT_VIEW_GROUPS, COHORT_VIEWS, (kind, key) => t(`components.single-cell.cohort.${kind}-${key}`)), [t]);
  if (!ctx) return null;

  const goCohort = (v) => {
    announceCohortView(v);
    requestHelpTarget({ scope: "cohort", view: v });
    if (report) dispatch(settingsActions.updateCaseReport(null));
    setOpen(false);
  };
  const goTab = (n) => {
    dispatch(settingsActions.updateTab(`${n}`));
    setOpen(false);
  };

  const patientGroups = PATIENT_RAIL.map((g) => ({
    key: g.key,
    label: g.label,
    icon: g.icon,
    items: g.tabs.map((x) => ({ id: `tab${x.tab}`, label: t(`containers.detail-view.tabs.tab${x.tab}`), desc: x.desc, disabled: availability[x.tab] === false, current: `${tab}` === `${x.tab}` || (x.tab === 12 && `${tab}` === "16") || (x.tab === 7 && `${tab}` === "17"), go: () => goTab(x.tab) })),
  }));
  const cohortGs = cohortGroups.map((g) => ({
    key: g.key,
    label: g.label,
    icon: GROUP_ICON[g.key],
    items: g.items.map((x) => ({ id: `view-${x.view}`, label: x.label, desc: x.desc, current: view === x.view, go: () => goCohort(x.view) })),
  }));
  const groups = ctx === "patient" ? patientGroups : cohortGs;
  const currentGroup = ctx === "patient" ? patientGroupOfTab(tab) : cohortGroupOfView(COHORT_VIEWS, view || "overview");
  const extras = [
    ctx === "patient" && { id: "to-cohort", label: "Cohort", icon: "TeamOutlined", desc: "Back to the cohort pages.", go: () => goCohort(view || "overview") },
    { id: "welcome", label: "Welcome", icon: "HomeOutlined", desc: "How to use gOS and where to find things.", go: () => goCohort("welcome") },
    { id: "methods", label: "Methods", icon: "ReadOutlined", desc: "How each result is produced.", go: () => goCohort("methods") },
    { id: "help", label: "Help", icon: "QuestionCircleOutlined", desc: "Search definitions and find analyses.", go: () => { openHelpCenter(); setOpen(false); } },
  ].filter(Boolean);

  const list = (
    <div className="sc-rail-list" role="navigation" aria-label="Single-cell pages">
      {groups.map((g) => (
        <div key={g.key} className="sc-rail-group" data-current={g.key === currentGroup}>
          <div className="sc-rail-group-title"><Icon name={g.icon} /> {g.label}</div>
          {g.items.map((it) => (
            <button key={it.id} type="button" className="sc-rail-item" data-current={!!it.current} disabled={it.disabled} onClick={it.go} aria-current={it.current ? "page" : undefined}>
              <span className="sc-rail-item-label">{it.label}</span>
              <span className="sc-rail-item-desc">{it.disabled ? "not available for this patient" : it.desc}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="sc-rail-group">
        {extras.map((it) => (
          <button key={it.id} type="button" className="sc-rail-item" data-current={it.id === "welcome" ? view === "welcome" : it.id === "methods" ? view === "methods" : false} onClick={it.go}>
            <span className="sc-rail-item-label"><Icon name={it.icon} /> {it.label}</span>
            <span className="sc-rail-item-desc">{it.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );

  if (phone) {
    return (
      <>
        <Button className="sc-rail-fab" type="primary" shape="circle" size="large" icon={<Icons.MenuOutlined />} aria-label="Open navigation" onClick={() => setOpen(true)} />
        <Drawer placement="left" open={open} onClose={() => setOpen(false)} width={Math.min(340, width - 24)} title="Navigate">{list}</Drawer>
      </>
    );
  }
  return (
    <div className="sc-rail" data-open={open} onMouseEnter={hoverOpen} onMouseLeave={hoverClose} onFocus={(e) => { if (e.target.matches(":focus-visible")) { suppress.current = false; setOpenState(true); } }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { clearTimer(); setOpenState(false); } }}>
      <div className="sc-rail-icons">
        {groups.map((g) => (
          <Tooltip key={g.key} title={g.label} placement="right" open={open ? false : undefined}>
            <button type="button" className="sc-rail-icon" data-current={g.key === currentGroup} aria-label={g.label} onClick={() => { const it = firstEnabledItem(g.items); if (it) it.go(); else setOpen(false); }}><Icon name={g.icon} /></button>
          </Tooltip>
        ))}
        <div className="sc-rail-sep" />
        {extras.map((it) => (
          <Tooltip key={it.id} title={it.label} placement="right" open={open ? false : undefined}>
            <button type="button" className="sc-rail-icon" aria-label={it.label} data-current={(it.id === "welcome" && view === "welcome") || (it.id === "methods" && view === "methods")} onClick={it.go}><Icon name={it.icon} /></button>
          </Tooltip>
        ))}
      </div>
      <div className="sc-rail-panel" hidden={!open}>{list}</div>
    </div>
  );
}
