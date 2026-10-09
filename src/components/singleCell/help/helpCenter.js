import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Collapse, Drawer, Empty, Input, Segmented, Select, Space, Tag, Tooltip, Typography, message } from "antd";
import { ArrowRightOutlined, QuestionCircleOutlined, SearchOutlined } from "@ant-design/icons";
import settingsActions from "../../../redux/settings/actions";
import datasetsActions from "../../../redux/datasets/actions";
import { getDetailTabAvailability } from "../../../helpers/detailTabAvailability";
import { isPatientRecord } from "../../../helpers/singleCell/cellFiles";
import { WHERE } from "../../../helpers/singleCell/provenance";
import { HELP_SECTIONS, buildHelpEntries, helpCardById, locationLabel, searchHelp } from "../../../helpers/singleCell/helpIndex";
import { onOpenHelpCenter, requestHelpTarget, scrollToHelpCard } from "../../../helpers/singleCell/helpNav";

const { Text, Paragraph, Title } = Typography;
const KINDS = ["all", "card", "method", "definition"];
const LAST_PATIENT_KEY = "gos.help.patient";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Text with the query terms marked. */
function Hl({ text, terms }) {
  if (!text) return null;
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map(escapeRe).join("|")})`, "ig");
  return String(text)
    .split(re)
    .map((part, i) => (i % 2 ? <mark key={i} className="sc-help-mark">{part}</mark> : <React.Fragment key={i}>{part}</React.Fragment>));
}

const patientIdOf = (r) => `${r.pair ?? r.caseReportId ?? r.id}`;

const storeGet = (k) => {
  try {
    return window.localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};
const storeSet = (k, v) => {
  try {
    window.localStorage.setItem(k, v);
  } catch (e) {
    /* storage blocked */
  }
};

/**
 * Searchable help for the single-cell views: where each analysis lives (with
 * a Go button that opens the tab and highlights the card), how each card is
 * computed (provenance registry), method write-ups and score definitions.
 * Mounted once in the top bar; "?" anywhere or any HelpDrawer button opens it.
 */
export default function HelpCenter() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const report = useSelector((s) => s.Settings.report);
  const tabAvailability = useSelector(getDetailTabAvailability);
  const datafiles = useSelector((s) => s.CaseReports.datafiles);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [patient, setPatient] = useState(() => storeGet(LAST_PATIENT_KEY));
  const pendingTab = useRef(null);
  const inputRef = useRef(null);

  const onPatient = !!report && tabAvailability[7] === true;
  const patients = useMemo(() => (datafiles || []).filter(isPatientRecord), [datafiles]);
  const hasSingleCell = patients.length > 0 || onPatient;

  useEffect(() => {
    if (!onPatient) return;
    setPatient(report);
    storeSet(LAST_PATIENT_KEY, report);
  }, [onPatient, report]);

  const entries = useMemo(() => buildHelpEntries({ defs: HELP_SECTIONS, t }), [t]);
  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const results = useMemo(() => searchHelp(entries, query, { kind }), [entries, query, kind]);
  const counts = useMemo(() => {
    const all = searchHelp(entries, query);
    return Object.fromEntries(KINDS.map((k) => [k, k === "all" ? all.length : all.filter((e) => e.kind === k).length]));
  }, [entries, query]);

  // open from HelpDrawer buttons / "?" key
  useEffect(
    () =>
      onOpenHelpCenter(({ query: q, kind: k } = {}) => {
        if (q != null) setQuery(q);
        if (k) setKind(k);
        setOpen(true);
      }),
    [],
  );
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  const tabName = useCallback((tab) => t(`containers.detail-view.tabs.tab${tab}`), [t]);

  // finish a patient-tab jump once the opened patient's tabs are known
  useEffect(() => {
    const p = pendingTab.current;
    if (!p || `${report}` !== `${p.patient}`) return;
    const avail = tabAvailability[p.tab];
    if (avail === true) {
      pendingTab.current = null;
      dispatch(settingsActions.updateTab(`${p.tab}`));
      scrollToHelpCard(p);
    } else if (avail === false && tabAvailability[7] === true) {
      pendingTab.current = null;
      message.warning(t("components.single-cell.help-center.tab-missing", { tab: tabName(p.tab) }));
    }
  }, [report, tabAvailability, dispatch, t, tabName]);

  const go = useCallback(
    (entry, loc) => {
      const target = { id: entry.id, anchor: loc.anchor || entry.anchor || null };
      if (loc.scope === "patient") {
        if (onPatient) {
          if (tabAvailability[loc.tab] === false) {
            message.warning(t("components.single-cell.help-center.tab-missing", { tab: tabName(loc.tab) }));
            return;
          }
          dispatch(settingsActions.updateTab(`${loc.tab}`));
          scrollToHelpCard(target);
        } else {
          const rec = patients.find((r) => patientIdOf(r) === `${patient}`) || patients[0];
          if (!rec) return;
          const pid = patientIdOf(rec);
          pendingTab.current = { ...target, tab: loc.tab, patient: pid };
          setTimeout(() => {
            if (pendingTab.current?.patient === pid) pendingTab.current = null;
          }, 30000);
          dispatch(datasetsActions.openCaseReport(rec.datasetId, pid));
        }
      } else {
        requestHelpTarget({ scope: "cohort", view: loc.view });
        if (report) dispatch(settingsActions.updateCaseReport(null));
        scrollToHelpCard(target, { tries: 60 });
      }
      setOpen(false);
    },
    [onPatient, tabAvailability, patients, patient, report, dispatch, t, tabName],
  );

  const showRelated = (id) => {
    const card = helpCardById(entries, id);
    if (!card) return;
    setKind("card");
    setQuery(card.title);
  };

  const locButtons = (e) =>
    (e.locations || []).map((loc, i) => {
      const missing = loc.scope === "patient" && onPatient && tabAvailability[loc.tab] === false;
      const noPatient = loc.scope === "patient" && !onPatient && !patients.length;
      return (
        <Tooltip key={i} title={missing ? t("components.single-cell.help-center.tab-missing", { tab: locationLabel(loc, t) }) : t("components.single-cell.help-center.go-help")}>
          <Button size="small" className="sc-help-go" disabled={missing || noPatient} onClick={() => go(e, loc)}>
            <Hl text={locationLabel(loc, t)} terms={terms} /> <ArrowRightOutlined />
          </Button>
        </Tooltip>
      );
    });

  const kindTag = (k) => <Tag className="sc-help-kind">{t(`components.single-cell.help-center.kind-${k}`)}</Tag>;

  const renderCard = (e, showKind) => {
    const where = WHERE[e.where] || WHERE.both;
    return (
      <div key={`c-${e.id}`} className="sc-help-item">
        <div className="sc-help-item-head">
          {showKind && kindTag("card")}
          <Text strong>
            <Hl text={e.title} terms={terms} />
          </Text>
          <Tag color={where.color} className="sc-help-where">
            {where.label}
          </Tag>
        </div>
        <div className="sc-help-rows">
          <span className="sc-help-key">{t("components.single-cell.help-center.calc")}</span>
          <span>
            <Hl text={e.calc} terms={terms} />
          </span>
          <span className="sc-help-key">{t("components.single-cell.help-center.data")}</span>
          <Text type="secondary">
            <Hl text={e.source} terms={terms} />
          </Text>
        </div>
        {e.locations?.length > 0 && (
          <Space size={4} wrap className="sc-help-locs">
            <Text type="secondary">{t("components.single-cell.help-center.found-in")}</Text>
            {locButtons(e)}
          </Space>
        )}
      </div>
    );
  };

  const renderMethod = (e, showKind) => ({
    key: e.id,
    label: (
      <span>
        {showKind && kindTag("method")}
        <Text strong>
          <Hl text={e.title} terms={terms} />
        </Text>
        <Text type="secondary"> — {e.summary}</Text>
      </span>
    ),
    children: (
      <div className="sc-help-method">
        {e.sections.map(([h, text]) => (
          <div key={h}>
            <Text strong>{h}</Text>
            <Paragraph style={{ marginBottom: 8 }}>
              <Hl text={text} terms={terms} />
            </Paragraph>
          </div>
        ))}
        {e.related?.length > 0 && (
          <Space size={4} wrap>
            <Text type="secondary">{t("components.single-cell.help-center.related")}</Text>
            {e.related.map((id) => {
              const c = helpCardById(entries, id);
              return c ? (
                <Tag key={id} className="sc-help-related" onClick={() => showRelated(id)}>
                  {c.title}
                </Tag>
              ) : null;
            })}
          </Space>
        )}
      </div>
    ),
  });

  const renderDefinition = (e, showKind) => (
    <div key={e.id} className="sc-help-item">
      <div className="sc-help-item-head">
        {showKind && kindTag("definition")}
        <Text strong>
          <Hl text={e.title} terms={terms} />
        </Text>
        <Tag>{t(`components.single-cell.help.${e.section}`)}</Tag>
      </div>
      <Paragraph style={{ margin: 0 }}>
        <Hl text={e.text} terms={terms} />
      </Paragraph>
    </div>
  );

  // Ranked flat list for a query; grouped browse view without one.
  const body = () => {
    if (!results.length) return <Empty description={t("components.single-cell.help-center.none")} />;
    if (terms.length) {
      const out = [];
      let run = [];
      const flush = () => {
        if (run.length) out.push(<Collapse key={`m-${out.length}`} size="small" items={run.map((m) => renderMethod(m, true))} className="sc-help-collapse" />);
        run = [];
      };
      results.forEach((e) => {
        if (e.kind === "method") {
          run.push(e);
          return;
        }
        flush();
        out.push(e.kind === "card" ? renderCard(e, true) : renderDefinition(e, true));
      });
      flush();
      return out;
    }
    const methods = results.filter((e) => e.kind === "method");
    const cards = results.filter((e) => e.kind === "card");
    const defs = results.filter((e) => e.kind === "definition");
    const byLoc = new Map();
    cards.forEach((c) => {
      const label = c.locations?.[0] ? locationLabel(c.locations[0], t) : t("components.single-cell.help-center.elsewhere");
      if (!byLoc.has(label)) byLoc.set(label, []);
      byLoc.get(label).push(c);
    });
    const defSections = [...new Set(defs.map((d) => d.section))];
    return (
      <>
        {methods.length > 0 && (
          <>
            <Title level={5} className="sc-help-group">
              {t("components.single-cell.help-center.methods")}
            </Title>
            <Collapse size="small" items={methods.map((m) => renderMethod(m, false))} className="sc-help-collapse" />
          </>
        )}
        {[...byLoc.entries()].map(([label, list]) => (
          <div key={label}>
            <Title level={5} className="sc-help-group">
              {label}
            </Title>
            {list.map((c) => renderCard(c, false))}
          </div>
        ))}
        {defSections.map((s) => (
          <div key={s}>
            <Title level={5} className="sc-help-group">
              {t("components.single-cell.help-center.definitions")} · {t(`components.single-cell.help.${s}`)}
            </Title>
            {defs.filter((d) => d.section === s).map((d) => renderDefinition(d, false))}
          </div>
        ))}
      </>
    );
  };

  if (!hasSingleCell) return null;
  const pickedPatient = patients.some((r) => patientIdOf(r) === `${patient}`) ? `${patient}` : patients[0] && patientIdOf(patients[0]);
  return (
    <>
      <Tooltip title={t("components.single-cell.help-center.open-help")}>
        <Button type="text" icon={<QuestionCircleOutlined />} onClick={() => setOpen(true)} aria-label={t("components.single-cell.help-center.title")}>
          {t("components.single-cell.help-center.button")}
        </Button>
      </Tooltip>
      <Drawer open={open} onClose={() => setOpen(false)} width="min(760px, 100vw)" title={t("components.single-cell.help-center.title")} className="sc-help-drawer">
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Input
            ref={inputRef}
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder={t("components.single-cell.help-center.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="sc-help-controls">
            <Segmented
              size="small"
              value={kind}
              onChange={setKind}
              options={KINDS.map((k) => ({ value: k, label: `${t(`components.single-cell.help-center.filter-${k}`)} (${counts[k]})` }))}
            />
            {!onPatient && patients.length > 0 && (
              <Space size={6}>
                <Text type="secondary">{t("components.single-cell.help-center.patient-for-go")}</Text>
                <Select
                  size="small"
                  style={{ minWidth: 120 }}
                  value={pickedPatient}
                  onChange={(v) => {
                    setPatient(v);
                    storeSet(LAST_PATIENT_KEY, v);
                  }}
                  options={patients.map((r) => ({ value: patientIdOf(r), label: patientIdOf(r) }))}
                />
              </Space>
            )}
          </div>
          <Text type="secondary" className="sc-help-hint">
            {t("components.single-cell.help-center.hint")}
          </Text>
          <div className="sc-help-results">{body()}</div>
        </Space>
      </Drawer>
    </>
  );
}
