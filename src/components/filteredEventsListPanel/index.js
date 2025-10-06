import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
import { connect } from "react-redux";
import {
  Tag,
  Table,
  Button,
  Space,
  Row,
  Col,
  Segmented,
  Skeleton,
  Tooltip,
  Avatar,
  Typography,
} from "antd";
import { slugify } from "../../helpers/report";
import { FileTextOutlined } from "@ant-design/icons";
import { BsDashLg } from "react-icons/bs";
import * as d3 from "d3";
import { ArrowRightOutlined } from "@ant-design/icons";
import { roleColorMap, tierColor } from "../../helpers/utility";
import TracksModal from "../tracksModal";
import Wrapper from "./index.style";
import { CgArrowsBreakeH } from "react-icons/cg";
import { InfoCircleOutlined } from "@ant-design/icons";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import ErrorPanel from "../errorPanel";
import ReportModal from "../reportModal";
import { HtmlRenderer } from "../../helpers/HtmlRenderer";
import { loadInlineReportAssets } from "../../helpers/reportAssets";
import { buildReportFromState } from "../../helpers/reportMapper";

const { Text } = Typography;

const { selectFilteredEvent, applyTierOverride, resetTierOverrides, updateAlterationFields } = filteredEventsActions;

const eventColumns = {
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  snv: [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
  cna: [0, 1, 2, 3, 4, 5, 7, 12],
  fusion: [0, 1, 2, 3, 4, 5, 8, 12],
};

class FilteredEventsListPanel extends Component {
  isApplyingOverrides = false;
  handleResetFilters = () => {
    this.setState({
      geneFilters: [],
      tierFilters: [],
      typeFilters: [],
      roleFilters: [],
      effectFilters: [],
      variantFilters: [],
    });
  };
  state = {
    eventType: "all",
    tierFilters: [1, 2], // start with tiers 1 & 2 checked
    typeFilters: [],
    roleFilters: [],
    effectFilters: [],
    variantFilters: [],
    geneFilters: [],
    showReportModal: false,
    exporting: false,
  };

  // add as a class field

  handleExportNotes = async () => {
    const { id, filteredEvents, report } = this.props;
    try {
      this.setState({ exporting: true });
      const assets = await loadInlineReportAssets();
      const partialState = {
        CaseReport: { id, metadata: report },
        FilteredEvents: { filteredEvents },
      };
      const reportObj = buildReportFromState(partialState);
      // Build delta store (only user changes), keyed like IndexedDB expects
      const { originalFilteredEvents = [] } = this.props;
      const origByUid = new Map(
        (originalFilteredEvents || []).map((d) => [d.uid, d])
      );
      const normStr = (v) => (v == null ? "" : String(v));
      const toList = (v) =>
        Array.isArray(v)
          ? v.map((s) => String(s).trim()).filter(Boolean)
          : String(v || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
      const sameArr = (a, b) => {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      };

      const deltaKv = [];
      (filteredEvents || []).forEach((ev) => {
        const orig = origByUid.get(ev.uid) || {};
        const anchor = slugify(`${ev?.gene} ${ev?.variant}`);
        if (!anchor) return;
        const base = `gos.field.${id}.${anchor}`;
        const tierKey = `gos.tier.${id}.${anchor}`;

        // Tier override delta
        const curTier = normStr(ev.tier);
        const origTier = normStr(orig.tier);
        if (curTier && curTier !== origTier) {
          deltaKv.push({ k: tierKey, v: curTier });
        }

        // Text fields deltas (allow empty string to clear a previously non-empty value)
        const fields = [
          ["gene_summary", "gene_summary"],
          ["variant_summary", "variant_summary"],
          ["effect_description", "effect_description"],
          ["notes", "notes"],
        ];
        fields.forEach(([prop, key]) => {
          const cur = normStr(ev[prop]);
          const prev = normStr(orig[prop]);
          if (cur !== prev) {
            deltaKv.push({ k: `${base}.${key}`, v: cur });
          }
        });

        // Pills deltas
        const curTher = toList(ev.therapeutics);
        const prevTher = toList(orig.therapeutics);
        if (!sameArr(curTher, prevTher)) {
          deltaKv.push({ k: `${base}.therapeutics`, v: curTher });
        }
        const curRes = toList(ev.resistances);
        const prevRes = toList(orig.resistances);
        if (!sameArr(curRes, prevRes)) {
          deltaKv.push({ k: `${base}.resistances`, v: curRes });
        }
      });

      const renderer = new HtmlRenderer();
      const filename = id ? `gos_report_${id}.html` : "gos_report.html";
      const res = await renderer.render(reportObj, {
        ...assets,
        filename,
        initialStore: deltaKv, // embed only deltas as [{k, v}]
      });
      const blob = new Blob([res.html], {
        type: res.mimeType || "text/html",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      // Optional: surface to user
      console.error("Report export failed:", err);
    } finally {
      this.setState({ exporting: false });
    }
  };

  handleLoadReport = async () => {
    try {
      const file = await new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".html,text/html";
        input.onchange = () => resolve(input.files && input.files[0]);
        input.click();
      });
      if (!file) return;

      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");

      // Check case id
      const currentCaseId = String(this.props.id || "");
      const meta = doc.querySelector('meta[name="gos-case-id"]');
      const importedCaseId = (meta && meta.getAttribute("content")) || "";
      if (!importedCaseId || importedCaseId !== currentCaseId) {
        alert("Uploaded report does not match the current case. Import aborted.");
        return;
      }

      // Extract embedded JSON state
      const scripts = Array.from(doc.querySelectorAll('script[type="application/json"]'));
      const parseCandidates = [];
      for (const s of scripts) {
        try {
          const txt = s.textContent || "";
          if (!txt.trim()) continue;
          parseCandidates.push(JSON.parse(txt));
        } catch (_) {}
      }
      const toKvMap = (data) => {
        const map = new Map();
        const add = (k, v) => {
          if (typeof k === "string") map.set(k, v);
        };
        if (Array.isArray(data)) {
          for (const it of data) {
            if (it && typeof it === "object" && ("k" in it || "key" in it)) {
              add(String(it.k ?? it.key), it.v ?? it.value);
            } else if (Array.isArray(it) && it.length === 2 && typeof it[0] === "string") {
              add(it[0], it[1]);
            }
          }
        } else if (data && typeof data === "object") {
          if (Array.isArray(data.items)) return toKvMap(data.items);
          if (Array.isArray(data.kv)) return toKvMap(data.kv);
          if (data.data && typeof data.data === "object") {
            Object.entries(data.data).forEach(([k, v]) => add(k, v));
          } else {
            Object.entries(data).forEach(([k, v]) => add(k, v));
          }
        }
        return map;
      };
      let storeMap = new Map();
      for (const cand of parseCandidates) {
        const m = toKvMap(cand);
        const cnt = Array.from(m.keys()).filter((k) => String(k).startsWith("gos.")).length;
        if (cnt > storeMap.size) storeMap = m;
      }
      if (!storeMap.size) {
        alert("Could not find embedded report state in the uploaded file.");
        return;
      }

      // Filter keys for this case
      const id = currentCaseId;
      const prefixes = [
        `gos.tier.${id}.`,
        `gos.field.${id}.`,
        `gos.notes.${id}`,
        `gos.genomic.${id}`,
      ];
      const entriesForCase = Array.from(storeMap.entries()).filter(([k]) =>
        prefixes.some((p) => String(k).startsWith(p))
      );

      // Overwrite IndexedDB for this case first
      await this.clearCaseFromIndexedDB(id);
      await new Promise((resolve) => {
        const dbName = "gos_report";
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("kv")) {
            db.createObjectStore("kv", { keyPath: "k" });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("kv", "readwrite");
          const store = tx.objectStore("kv");
          for (const [k, v] of entriesForCase) {
            try {
              store.put({ k: String(k), v });
            } catch (_) {}
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = tx.onerror = () => {
            db.close();
            resolve();
          };
        };
        req.onerror = () => resolve();
      });

      // Apply to Redux
      const { filteredEvents, applyTierOverride, updateAlterationFields } = this.props;
      const get = (k) => storeMap.get(k);
      const toList = (val) =>
        Array.isArray(val)
          ? val.map(String)
          : String(val || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);

      for (const ev of (filteredEvents || [])) {
        const anchor = slugify(`${ev?.gene} ${ev?.variant}`);
        if (!anchor) continue;
        const tierKey = `gos.tier.${id}.${anchor}`;
        const baseKey = `gos.field.${id}.${anchor}`;

        const tierVal = get(tierKey);
        if (tierVal != null && String(tierVal) !== String(ev.tier)) {
          applyTierOverride(ev.uid, String(tierVal));
        }

        const changes = {};
        const gs = get(`${baseKey}.gene_summary`);
        if (gs != null) changes.gene_summary = String(gs);
        const vs = get(`${baseKey}.variant_summary`);
        if (vs != null) changes.variant_summary = String(vs);
        const ed = get(`${baseKey}.effect_description`);
        if (ed != null) changes.effect_description = String(ed);
        const nt = get(`${baseKey}.notes`);
        if (nt != null) changes.notes = String(nt);
        const th = get(`${baseKey}.therapeutics`);
        if (th != null) changes.therapeutics = toList(th);
        const rs = get(`${baseKey}.resistances`);
        if (rs != null) changes.resistances = toList(rs);

        if (Object.keys(changes).length) {
          updateAlterationFields(ev.uid, changes);
        }
      }

      alert("Report loaded.");
    } catch (err) {
      console.error("Failed to load report:", err);
      alert("Failed to load report.");
    }
  };

  clearCaseFromIndexedDB = async (caseId) => {
    try {
      if (!window.indexedDB || !caseId) return;
      const prefixes = [`gos.tier.${caseId}.`, `gos.field.${caseId}.`];

      const dbInfos =
        (indexedDB.databases && (await indexedDB.databases())) || [];
      const dbNames = (dbInfos || []).map((d) => d?.name).filter(Boolean);

      const matchesPrefix = (s) =>
        typeof s === "string" &&
        prefixes.some(
          (p) => s.startsWith(p) || s.includes(`::${p}`)
        );

      await Promise.all(
        dbNames
          .filter((name) => name && name.startsWith("gos_report"))
          .map(
            (dbName) =>
              new Promise((resolve) => {
                const req = indexedDB.open(dbName);
                req.onerror = () => resolve();
                req.onsuccess = () => {
                  const db = req.result;
                  const stores = Array.from(db.objectStoreNames || []);
                  const nextStore = (i) => {
                    if (i >= stores.length) {
                      db.close();
                      resolve();
                      return;
                    }
                    const storeName = stores[i];
                    const tx = db.transaction(storeName, "readwrite");
                    const store = tx.objectStore(storeName);

                    let usedCursor = false;
                    try {
                      const cursorReq = store.openCursor();
                      usedCursor = true;
                      cursorReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                          const key = cursor.key;
                          const val = cursor.value;
                          const keyStr = typeof key === "string" ? key : "";
                          const kProp =
                            (val && (val.k || val.key)) || "";
                          const candidateStrs = [
                            keyStr,
                            String(kProp || ""),
                          ];
                          const shouldDel = candidateStrs.some(matchesPrefix);
                          if (shouldDel) {
                            store.delete(key);
                          }
                          cursor.continue();
                        }
                      };
                    } catch (_) {
                      usedCursor = false;
                    }

                    if (!usedCursor && store.getAllKeys && store.getAll) {
                      const keysReq = store.getAllKeys();
                      const valsReq = store.getAll();
                      keysReq.onsuccess = () => {
                        const keys = keysReq.result || [];
                        valsReq.onsuccess = () => {
                          const vals = valsReq.result || [];
                          keys.forEach((k, idx) => {
                            const keyStr =
                              typeof k === "string" ? k : "";
                            const v = vals[idx];
                            const kProp = (v && (v.k || v.key)) || "";
                            const candidateStrs = [
                              keyStr,
                              String(kProp || ""),
                            ];
                            const shouldDel =
                              candidateStrs.some(matchesPrefix);
                            if (shouldDel) store.delete(k);
                          });
                        };
                      };
                    }

                    tx.oncomplete = () => nextStore(i + 1);
                    tx.onabort = tx.onerror = () => nextStore(i + 1);
                  };

                  nextStore(0);
                };
              })
          )
      );
    } catch (err) {
      console.error("Failed clearing case state from IndexedDB:", err);
    }
  };

  handleResetReportState = async () => {
    const { id, resetTierOverrides, selectFilteredEvent } = this.props;
    const caseId = id ? String(id) : "";
    if (!caseId) {
      alert("No case ID available to reset.");
      return;
    }
    const c1 = window.confirm(
      "Reset all local changes to this report (tiers and edited fields)?"
    );
    if (!c1) return;
    const c2 = window.confirm(
      "Are you absolutely sure? This will permanently remove local edits for this case."
    );
    if (!c2) return;

    // 1) Clear IndexedDB for this case
    await this.clearCaseFromIndexedDB(caseId);

    // 2) Reset Redux overrides and selection
    resetTierOverrides();
    selectFilteredEvent(null);
  };

  handleCloseReportModal = async () => {
    this.setState({ showReportModal: false });
    this.props.selectFilteredEvent(null);
  };

  componentDidMount() {
    this.applyAllTierOverridesIfAny({ reset: true });
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.originalFilteredEvents !== this.props.originalFilteredEvents &&
      Array.isArray(this.props.originalFilteredEvents) &&
      this.props.originalFilteredEvents.length
    ) {
      this.applyAllTierOverridesIfAny({ reset: true });
    }
  }

  handleSegmentedChange = (eventType) => {
    this.setState({ eventType });
  };

  handleTableChange = (pagination, filters, sorter) => {
    // When the user changes filters (e.g. checks tier 3),
    // update tierFilters in the state:
    this.setState({
      geneFilters: filters.gene || [],
      tierFilters: filters.tier || [],
      typeFilters: filters.type || [],
      roleFilters: filters.role || [],
      effectFilters: filters.effect || [],
      variantFilters: filters.variant || [],
    });
  };

  buildTierKey = (caseId, record) => {
    if (!caseId || !record) return null;
    const anchor = slugify(`${record?.gene} ${record?.variant}`);
    return `gos.tier.${caseId}.${anchor}`;
  };

  getTierOverrideFromIDB = async (tierKey) => {
    try {
      if (!window.indexedDB || !tierKey) return null;

      const dbInfos =
        (indexedDB.databases && (await indexedDB.databases())) || [];
      const dbNames = (dbInfos || []).map((d) => d?.name).filter(Boolean);

      for (const dbName of dbNames) {
        if (!dbName || !dbName.startsWith("gos_report")) continue;

        const result = await new Promise((resolve) => {
          const openReq = indexedDB.open(dbName);
          openReq.onerror = () => resolve(null);
          openReq.onsuccess = () => {
            const db = openReq.result;
            const stores = Array.from(db.objectStoreNames || []);
            if (!stores.length) {
              db.close();
              resolve(null);
              return;
            }

            const fullKey = `${dbName}::${tierKey}`;

            const tryStore = (i) => {
              if (i >= stores.length) {
                db.close();
                resolve(null);
                return;
              }
              const storeName = stores[i];
              const tx = db.transaction(storeName, "readonly");
              const store = tx.objectStore(storeName);

              const getReq = store.get(fullKey);
              getReq.onsuccess = () => {
                const val = getReq.result;
                if (val != null) {
                  db.close();
                  resolve(
                    typeof val === "object" && val !== null
                      ? val.v ?? null
                      : val
                  );
                  return;
                }
                if (!store.getAll) {
                  tryStore(i + 1);
                  return;
                }
                const allReq = store.getAll();
                allReq.onsuccess = () => {
                  const arr = allReq.result || [];
                  const match = arr.find(
                    (r) =>
                      r?.k === fullKey ||
                      r?.k === tierKey ||
                      r?.key === tierKey ||
                      r === fullKey ||
                      r === tierKey
                  );
                  if (match) {
                    db.close();
                    resolve(
                      typeof match === "object" && match !== null
                        ? match.v ?? null
                        : match
                    );
                  } else {
                    tryStore(i + 1);
                  }
                };
                allReq.onerror = () => tryStore(i + 1);
              };
              getReq.onerror = () => tryStore(i + 1);
            };

            tryStore(0);
          };
        });

        if (result != null) {
          const num = Number(result);
          return Number.isFinite(num) ? String(num) : String(result);
        }
      }
    } catch (_) {}
    return null;
  };

  applyTierOverrideIfAny = async () => {
    console.log("Applying tier override if any...");
    const { id, selectedFilteredEvent, viewMode } = this.props;
    if (!selectedFilteredEvent || viewMode !== "detail") return;

    const tierKey = this.buildTierKey(id, selectedFilteredEvent);
    const override = await this.getTierOverrideFromIDB(tierKey);
    if (override != null && `${selectedFilteredEvent.tier}` !== `${override}`) {
      this.props.applyTierOverride(selectedFilteredEvent.uid, `${override}`);
    } else {
      console.log("No tier override found or no change needed.");
    }
  };

  applyAllTierOverridesIfAny = async (opts = {}) => {
    const { reset = false } = opts;
    const {
      id,
      filteredEvents,
      originalFilteredEvents,
      applyTierOverride,
      resetTierOverrides,
    } = this.props;

    if (
      !Array.isArray(filteredEvents) ||
      !filteredEvents.length ||
      !Array.isArray(originalFilteredEvents) ||
      !originalFilteredEvents.length
    ) {
      return;
    }

    if (this.isApplyingOverrides) return;
    this.isApplyingOverrides = true;

    try {
      if (reset) {
        // Start from the original snapshot to avoid stale overrides lingering
        resetTierOverrides();
      }

      // Build a quick lookup for original tiers
      const origTierMap = new Map(
        originalFilteredEvents.map((d) => [d.uid, String(d.tier)])
      );

      await Promise.all(
        filteredEvents.map(async (ev) => {
          const key = this.buildTierKey(id, ev);
          const override = await this.getTierOverrideFromIDB(key);

          if (override != null) {
            const origTier = origTierMap.get(ev.uid);
            if (String(origTier) !== String(override)) {
              applyTierOverride(ev.uid, String(override));
            }
          }
        })
      );
    } finally {
      this.isApplyingOverrides = false;
    }
  };

  render() {
    const {
      t,
      id,
      filteredEvents,
      selectedFilteredEvent,
      viewMode,
      loading,
      error,
      genome,
      mutations,
      chromoBins,
      genomeCoverage,
      methylationBetaCoverage,
      methylationIntensityCoverage,
      hetsnps,
      genes,
      allelic,
      igv,
      reportSrc,
      selectFilteredEvent,
    } = this.props;

    let open = selectedFilteredEvent?.id;

    let {
      eventType,
      tierFilters,
      typeFilters,
      geneFilters,
      roleFilters,
      effectFilters,
      variantFilters,
      showReportModal,
    } = this.state;

    let recordsHash = d3.group(
      filteredEvents.filter((d) => d.tier && +d.tier < 3),
      (d) => d.eventType
    );
    let records =
      (eventType === "all" ? filteredEvents : recordsHash.get(eventType)) || [];

    const columns = [
      {
        title: t("components.filtered-events-panel.gene"),
        dataIndex: "gene",
        key: "gene",
        width: 100,
        ellipsis: {
          showTitle: false,
        },
        filters: [...new Set(records.map((d) => d.gene))]
          .sort((a, b) => d3.ascending(a, b))
          .map((d) => {
            return {
              text: d,
              value: d,
            };
          }),
        filterMultiple: true,
        onFilter: (value, record) => record.gene?.startsWith(value),
        filteredValue: geneFilters, // controlled by the component
        filterSearch: true,
        sorter: {
          compare: (a, b) => {
            if (a.gene == null) return 1;
            if (b.gene == null) return -1;
            return d3.ascending(a.gene, b.gene);
          },
        },
        render: (_, record) =>
          record.gene != null ? (
            <Button
              type="link"
              onClick={() => selectFilteredEvent(record, "detail")}
            >
              <Tooltip placement="topLeft" title={record.gene}>
                {record.gene}
              </Tooltip>
            </Button>
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.role"),
        dataIndex: "role",
        key: "role",
        filters: [...new Set(records.map((d) => d.role))]
          .sort((a, b) => d3.ascending(a, b))
          .map((d) => {
            return {
              text: d,
              value: d,
            };
          }),
        filterMultiple: true,
        onFilter: (value, record) => record.role === value,
        filteredValue: roleFilters, // controlled by the component
        sorter: {
          compare: (a, b) => {
            if (a.role == null) return 1;
            if (b.role == null) return -1;
            return d3.ascending(a.role, b.role);
          },
        },
        render: (_, record) =>
          record.role != null ? (
            record.role
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.variant"),
        dataIndex: "variant",
        key: "variant",
        width: 120,
        sorter: {
          compare: (a, b) => {
            if (a.variant == null) return 1;
            if (b.variant == null) return -1;
            return d3.ascending(a.variant, b.variant);
          },
        },
        filters: [...new Set(records.map((d) => d.variant))]
          .sort((a, b) => d3.ascending(a, b))
          .map((d) => {
            return {
              text: d,
              value: d,
            };
          }),
        filterMultiple: true,
        onFilter: (value, record) => record.variant === value,
        filteredValue: variantFilters, // controlled by the component
        render: (_, record) =>
          record.variant != null ? (
            record.variant
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.type"),
        dataIndex: "type",
        key: "type",
        width: 100,
        sorter: {
          compare: (a, b) => {
            if (a.type == null) return 1;
            if (b.type == null) return -1;
            return d3.ascending(a.type, b.type);
          },
        },
        filters: [...new Set(records.map((d) => d.type))].map((d) => {
          return {
            text: d,
            value: d,
          };
        }),
        filterMultiple: true,
        onFilter: (value, record) => record.type === value,
        filteredValue: typeFilters, // controlled by the component
        render: (_, record) =>
          record.type != null ? (
            record.type
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.effect"),
        dataIndex: "effect",
        key: "effect",
        filters: [...new Set(records.map((d) => d.effect))]
          .sort((a, b) => d3.ascending(a, b))
          .map((d) => {
            return {
              text: d,
              value: d,
            };
          }),
        filterMultiple: true,
        onFilter: (value, record) => record.effect === value,
        filteredValue: effectFilters, // controlled by the component
        sorter: {
          compare: (a, b) => {
            if (a.effect == null) return 1;
            if (b.effect == null) return -1;
            return d3.ascending(a.effect, b.effect);
          },
        },
        render: (_, record) =>
          record.effect != null ? (
            record.effect
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: (
          <Space>
            {t("components.filtered-events-panel.tier")}
            <Tooltip
              title={
                <Space direction="vertical">
                  {[1, 2, 3].map((d, i) => (
                    <Space key={i}>
                      <Avatar
                        size="small"
                        style={{
                          color: "#FFF",
                          backgroundColor: tierColor(+d),
                        }}
                      >
                        {d}
                      </Avatar>
                      {t(`components.filtered-events-panel.tier-info.${d}`)}
                    </Space>
                  ))}
                </Space>
              }
            >
              <InfoCircleOutlined />
            </Tooltip>
          </Space>
        ),
        dataIndex: "tier",
        key: "tier",
        width: 120,
        sorter: {
          compare: (a, b) => {
            if (a.tier == null) return 1;
            if (b.tier == null) return -1;
            return d3.ascending(+a.tier, +b.tier);
          },
        },
        filters: [...new Set(records.map((d) => d.tier))].map((d) => {
          return {
            text: d,
            value: +d,
          };
        }),
        filterMultiple: true,
        onFilter: (value, record) => +record.tier === +value,
        filteredValue: tierFilters, // controlled by the component
        render: (_, record) =>
          record.tier != null ? (
            <Tooltip
              title={t(
                `components.filtered-events-panel.tier-info.${record.tier}`
              )}
            >
              <Button
                type="link"
                onClick={() => selectFilteredEvent(record, "detail")}
              >
                <Avatar
                  size="small"
                  style={{
                    color: "#FFF",
                    backgroundColor: tierColor(+record.tier),
                  }}
                >
                  {record.tier}
                </Avatar>
              </Button>
            </Tooltip>
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.estimatedAlteredCopies"),
        dataIndex: "estimatedAlteredCopies",
        key: "estimatedAlteredCopies",
        width: 100,
        sorter: {
          compare: (a, b) => {
            if (a.estimatedAlteredCopies == null) return 1;
            if (b.estimatedAlteredCopies == null) return -1;
            return d3.ascending(
              +a.estimatedAlteredCopies,
              +b.estimatedAlteredCopies
            );
          },
        },
        render: (_, record) =>
          record.estimatedAlteredCopies != null ? (
            d3.format(".3f")(+record.estimatedAlteredCopies)
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.segmentCopyNumber"),
        dataIndex: "segmentCopyNumber",
        key: "segmentCopyNumber",
        width: 130,
        sorter: {
          compare: (a, b) => {
            if (a.segmentCopyNumber == null) return 1;
            if (b.segmentCopyNumber == null) return -1;
            return d3.ascending(+a.segmentCopyNumber, +b.segmentCopyNumber);
          },
        },
        render: (_, record) =>
          record.segmentCopyNumber != null ? (
            d3.format(".3f")(+record.segmentCopyNumber)
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.fusionCopyNumber"),
        dataIndex: "fusionCopyNumber",
        key: "fusionCopyNumber",
        width: 100,
        sorter: {
          compare: (a, b) => {
            if (a.fusionCopyNumber == null) return 1;
            if (b.fusionCopyNumber == null) return -1;
            return d3.ascending(+a.fusionCopyNumber, +b.fusionCopyNumber);
          },
        },
        render: (_, record) =>
          record.fusionCopyNumber != null ? (
            d3.format(".3f")(+record.fusionCopyNumber)
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.altCounts"),
        dataIndex: "altCounts",
        key: "altCounts",
        width: 100,
        sorter: {
          compare: (a, b) => {
            if (a.altCounts == null) return 1;
            if (b.altCounts == null) return -1;
            return d3.ascending(+a.altCounts, +b.altCounts);
          },
        },
        render: (_, record) =>
          record.altCounts != null ? (
            +record.altCounts
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.refCounts"),
        dataIndex: "refCounts",
        key: "refCounts",
        width: 100,
        sorter: {
          compare: (a, b) => {
            if (a.refCounts == null) return 1;
            if (b.refCounts == null) return -1;
            return d3.ascending(+a.refCounts, +b.refCounts);
          },
        },
        render: (_, record) =>
          record.refCounts != null ? (
            +record.refCounts
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.vaf"),
        dataIndex: "vaf",
        key: "vaf",
        width: 120,
        sorter: {
          compare: (a, b) => {
            if (a.vaf == null) return 1;
            if (b.vaf == null) return -1;
            return d3.ascending(+a.vaf, +b.vaf);
          },
        },
        render: (_, record) =>
          record.vaf != null ? (
            d3.format(".3f")(+record.vaf)
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
      {
        title: t("components.filtered-events-panel.location"),
        dataIndex: "location",
        key: "location",
        width: 100,
        fixed: "right",
        ellipsis: true,
        render: (_, record) =>
          record.location != null ? (
            <Space direction="horizontal" size={0}>
              {record.location}{" "}
              <Button
                type="link"
                onClick={() => selectFilteredEvent(record, "tracks")}
              >
                <ArrowRightOutlined />
              </Button>
            </Space>
          ) : (
            <Text italic disabled>
              <BsDashLg />
            </Text>
          ),
      },
    ];

    return (
      <Wrapper>
        {error ? (
          <Row className="ant-panel-container ant-home-plot-container">
            <Col className="gutter-row table-container" span={24}>
              <ErrorPanel
                avatar={<CgArrowsBreakeH />}
                header={t("components.filtered-events-panel.header")}
                title={t("components.filtered-events-panel.error.title", {
                  id,
                })}
                subtitle={t("components.filtered-events-panel.error.subtitle")}
                explanationTitle={t(
                  "components.filtered-events-panel.error.explanation.title"
                )}
                explanationDescription={error.stack}
              />
            </Col>
          </Row>
        ) : (
          <>
            <Row
              className="ant-panel-container ant-home-plot-container"
              align="middle"
              justify="space-between"
            >
              <Col flex="auto">
                <Segmented
                  size="small"
                  options={Object.keys(eventColumns).map((d) => {
                    return {
                      label: (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: t(
                              "components.filtered-events-panel.event",
                              {
                                eventType: t(
                                  `components.filtered-events-panel.event-types.${d}`
                                ),
                                count: (d === "all"
                                  ? filteredEvents
                                  : recordsHash.get(d) || []
                                ).length,
                              }
                            ),
                          }}
                        />
                      ),
                      value: d,
                      disabled:
                        (d === "all"
                          ? filteredEvents
                          : recordsHash.get(d) || []
                        ).length === 0,
                    };
                  })}
                  onChange={(d) => this.handleSegmentedChange(d)}
                  value={eventType}
                />
              </Col>
              <Col style={{ textAlign: "right" }} flex="none">
                <Button
                  type="link"
                  onClick={this.handleResetFilters}
                  style={{ float: "right", marginBottom: 16 }}
                >
                  {t("components.filtered-events-panel.reset-filters")}
                </Button>
              </Col>
            </Row>
            <Row className="ant-panel-container ant-home-plot-container">
              <Col flex="none">
                <Space>
                  <Button
                    type="primary"
                    icon={<FileTextOutlined />}
                    onClick={this.handleExportNotes}
                    disabled={loading || this.state.exporting}
                    style={{ marginBottom: 16 }}
                  >
                    {t("components.filtered-events-panel.export.notes")}
                  </Button>
                  <Button
                    onClick={this.handleLoadReport}
                    style={{ marginBottom: 16 }}
                  >
                    Load Report
                  </Button>
                </Space>
              </Col>
              <Col flex="auto" />
              <Col style={{ textAlign: "right" }} flex="none">
                <Button
                  danger
                  onClick={this.handleResetReportState}
                  style={{ marginBottom: 16 }}
                >
                  Reset
                </Button>
              </Col>
              <Col className="gutter-row table-container" span={24}>
                {
                  <Skeleton active loading={loading}>
                    <Table
                      columns={columns.filter((d, i) =>
                        eventColumns[eventType].includes(i)
                      )}
                      dataSource={records}
                      pagination={{ pageSize: 50 }}
                      showSorterTooltip={false}
                      onChange={this.handleTableChange}
                      scroll={{ x: "max-content", y: 500 }}
                    />
                    {selectedFilteredEvent && viewMode === "tracks" && (
                      <TracksModal
                        {...{
                          showVariants: true,
                          selectedVariantId: selectedFilteredEvent.uid,
                          loading,
                          genome,
                          mutations,
                          genomeCoverage,
                          methylationBetaCoverage,
                          methylationIntensityCoverage,
                          hetsnps,
                          genes,
                          igv,
                          chromoBins,
                          allelic,
                          modalTitleText: selectedFilteredEvent.gene,
                          modalTitle: (
                            <Space>
                              {selectedFilteredEvent.gene}
                              {selectedFilteredEvent.name}
                              {selectedFilteredEvent.type}
                              {selectedFilteredEvent.role
                                ?.split(",")
                                .map((tag) => (
                                  <Tag
                                    color={roleColorMap()[tag.trim()]}
                                    key={tag.trim()}
                                  >
                                    {tag.trim()}
                                  </Tag>
                                ))}
                              {selectedFilteredEvent.tier}
                              {selectedFilteredEvent.location}
                            </Space>
                          ),
                          genomePlotTitle: t(
                            "components.tracks-modal.genome-plot"
                          ),
                          genomePlotYAxisTitle: t(
                            "components.tracks-modal.genome-y-axis-title"
                          ),
                          coveragePlotTitle: t(
                            "components.tracks-modal.coverage-plot"
                          ),
                          coverageYAxisTitle: t(
                            "components.tracks-modal.coverage-copy-number"
                          ),
                          coverageYAxis2Title: t(
                            "components.tracks-modal.coverage-count"
                          ),
                          methylationBetaCoveragePlotTitle: t(
                            "components.tracks-modal.methylation-beta-coverage-plot"
                          ),
                          methylationBetaCoverageYAxisTitle: t(
                            "components.tracks-modal.methylation-beta-coverage-y-axis-title"
                          ),
                          methylationBetaCoverageYAxis2Title: t(
                            "components.tracks-modal.methylation-beta-coverage-y-axis2-title"
                          ),
                          methylationIntensityCoveragePlotTitle: t(
                            "components.tracks-modal.methylation-intensity-coverage-plot"
                          ),
                          methylationIntensityCoverageYAxisTitle: t(
                            "components.tracks-modal.methylation-intensity-coverage-y-axis-title"
                          ),
                          methylationIntensityCoverageYAxis2Title: t(
                            "components.tracks-modal.methylation-intensity-coverage-y-axis2-title"
                          ),
                          hetsnpPlotTitle: t(
                            "components.tracks-modal.hetsnp-plot"
                          ),
                          hetsnpPlotYAxisTitle: t(
                            "components.tracks-modal.hetsnp-copy-number"
                          ),
                          hetsnpPlotYAxis2Title: t(
                            "components.tracks-modal.hetsnps-count"
                          ),
                          mutationsPlotTitle: t(
                            "components.tracks-modal.mutations-plot"
                          ),
                          mutationsPlotYAxisTitle: t(
                            "components.tracks-modal.mutations-plot-y-axis-title"
                          ),
                          allelicPlotTitle: t(
                            "components.tracks-modal.allelic-plot"
                          ),
                          allelicPlotYAxisTitle: t(
                            "components.tracks-modal.allelic-plot-y-axis-title"
                          ),
                          handleOkClicked: () => selectFilteredEvent(null),
                          handleCancelClicked: () => selectFilteredEvent(null),
                          open,
                        }}
                      />
                    )}
                    {selectedFilteredEvent && viewMode === "detail" && (
                      <ReportModal
                        open
                        onClose={this.handleCloseReportModal}
                        src={
                          reportSrc
                            ? `${reportSrc}#${slugify(
                                `${selectedFilteredEvent?.gene} ${selectedFilteredEvent?.variant}`
                              )}`
                            : undefined
                        }
                        title={
                          <Space>
                            {selectedFilteredEvent.gene}
                            {selectedFilteredEvent.name}
                            {selectedFilteredEvent.type}
                            {selectedFilteredEvent.role
                              ?.split(",")
                              .map((tag) => (
                                <Tag
                                  color={roleColorMap()[tag.trim()]}
                                  key={tag.trim()}
                                >
                                  {tag.trim()}
                                </Tag>
                              ))}
                            {selectedFilteredEvent.tier}
                            {selectedFilteredEvent.location}
                          </Space>
                        }
                        loading={loading}
                        genome={genome}
                        mutations={mutations}
                        genomeCoverage={genomeCoverage}
                        methylationBetaCoverage={methylationBetaCoverage}
                        methylationIntensityCoverage={
                          methylationIntensityCoverage
                        }
                        hetsnps={hetsnps}
                        genes={genes}
                        igv={igv}
                        chromoBins={chromoBins}
                        allelic={allelic}
                        selectedVariantId={selectedFilteredEvent?.uid}
                        showVariants
                        record={selectedFilteredEvent}
                      />
                    )}
                    {showReportModal && reportSrc && (
                      <ReportModal
                        open={showReportModal}
                        onClose={this.handleCloseReportModal}
                        src={reportSrc}
                        title={t(
                          "components.filtered-events-panel.export.notes"
                        )}
                        loading={loading}
                        genome={genome}
                        mutations={mutations}
                        genomeCoverage={genomeCoverage}
                        methylationBetaCoverage={methylationBetaCoverage}
                        methylationIntensityCoverage={
                          methylationIntensityCoverage
                        }
                        hetsnps={hetsnps}
                        genes={genes}
                        igv={igv}
                        chromoBins={chromoBins}
                        allelic={allelic}
                      />
                    )}
                  </Skeleton>
                }
              </Col>
            </Row>
          </>
        )}
      </Wrapper>
    );
  }
}
FilteredEventsListPanel.propTypes = {};
FilteredEventsListPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  selectFilteredEvent: (filteredEvent, viewMode) =>
    dispatch(selectFilteredEvent(filteredEvent, viewMode)),
  applyTierOverride: (uid, tier) => dispatch(applyTierOverride(uid, tier)),
  resetTierOverrides: () => dispatch(resetTierOverrides()),
  updateAlterationFields: (uid, changes) =>
    dispatch(updateAlterationFields(uid, changes)),
});
const mapStateToProps = (state) => ({
  loading: state.FilteredEvents.loading,
  filteredEvents: state.FilteredEvents.filteredEvents,
  originalFilteredEvents: state.FilteredEvents.originalFilteredEvents,
  selectedFilteredEvent: state.FilteredEvents.selectedFilteredEvent,
  viewMode: state.FilteredEvents.viewMode,
  error: state.FilteredEvents.error,
  reportSrc: state.FilteredEvents.reportSrc,
  id: state.CaseReport.id,
  report: state.CaseReport.metadata,
  genome: state.Genome,
  mutations: state.Mutations,
  allelic: state.Allelic,
  chromoBins: state.Settings.chromoBins,
  genomeCoverage: state.GenomeCoverage,
  methylationBetaCoverage: state.MethylationBetaCoverage,
  methylationIntensityCoverage: state.MethylationIntensityCoverage,
  hetsnps: state.Hetsnps,
  genes: state.Genes,
  igv: state.Igv,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(FilteredEventsListPanel)));
