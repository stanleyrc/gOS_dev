import React, { useEffect, useState, useRef } from "react";
import { Modal, Spin, Alert, Tabs, Row, Col, Descriptions, Space, Avatar, Typography, Upload, Button, message } from "antd";
import Wrapper from "./index.style";

import TracksModal from "../tracksModal";
import { withTranslation } from "react-i18next";
import { tierColor } from "../../helpers/utility";

const { Item } = Descriptions;
const { Text } = Typography;

function ReportModal({
  open,
  onClose,
  src,
  title = "Report",
  // data for plots
  loading,
  genome,
  mutations,
  chromoBins,
  genomeCoverage,
  methylationBetaCoverage,
  methylationIntensityCoverage,
  hetsnps,
  genes,
  igv,
  allelic,
  // optional: focus on a specific variant
  selectedVariantId,
  showVariants,
  // i18n
  t,
  record,
}) {
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("report");

  // enable Summary fallback when no src or an error occurs and a record is provided
  const showSummaryFallback = !!record && (!src || !!error);

  useEffect(() => {
    if (!open) return;
    setActiveTab(showSummaryFallback ? "summary" : "report");
  }, [open, showSummaryFallback]);

  const iframeRef = useRef(null);
  const anchorTimersRef = useRef([]);

  // Adjust if your report uses non-default names
  const DB = { name: "gos_report", store: "kv" };

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = window.indexedDB.open(DB.name);
      req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB"));
      req.onsuccess = () => resolve(req.result);
    });
  }

  function idbAllKeys(db) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(DB.store, "readonly");
        const store = tx.objectStore(DB.store);
        const req = store.getAllKeys ? store.getAllKeys() : store.openCursor();
        const keys = [];
        if (store.getAllKeys) {
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        } else {
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              keys.push(cursor.key);
              cursor.continue();
            } else {
              resolve(keys);
            }
          };
          req.onerror = () => reject(req.error);
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  function idbGet(db, key) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(DB.store, "readonly");
        const store = tx.objectStore(DB.store);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  function idbPutMany(db, puts) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(DB.store, "readwrite");
        const store = tx.objectStore(DB.store);
        const keyPath = store.keyPath;

        for (let [k, v] of puts) {
          if (keyPath === null) {
            // Out-of-line keys: pass the key separately
            store.put(v, k);
            continue;
          }

          if (typeof keyPath === "string") {
            // In-line key: ensure the record carries the key at keyPath
            let record = v;
            if (record === null || typeof record !== "object") {
              record = { [keyPath]: k, value: v };
            } else if (record[keyPath] !== k) {
              record = { ...record, [keyPath]: k };
            }
            store.put(record);
            continue;
          }

          // Unsupported/compound keyPath
          tx.abort();
          reject(new Error("Unsupported object store keyPath"));
          return;
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Transaction failed"));
        tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
      } catch (e) {
        reject(e);
      }
    });
  }

  function idbDelMany(db, dels) {
    return new Promise((resolve, reject) => {
      if (!dels.length) return resolve();
      try {
        const tx = db.transaction(DB.store, "readwrite");
        const store = tx.objectStore(DB.store);
        for (const k of dels) {
          store.delete(k);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Transaction failed"));
        tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
      } catch (e) {
        reject(e);
      }
    });
  }

  // Key helpers for prefixed keys:
  // Original keys in IndexedDB look like: "__gosdoc__<docId>__::<internalKey>"
  // Uploaded JSON entries have <internalKey> (no prefix).
  function parseGosdocPrefixed(key) {
    if (typeof key !== "string") return null;
    const m = key.match(/^__gosdoc__(.+?)__::(.+)$/);
    return m ? { docId: m[1], internal: m[2] } : null;
  }

  function stripGosdocPrefix(key) {
    const p = parseGosdocPrefixed(key);
    return p ? p.internal : key;
  }

  function ensurePrefixedForDoc(docId, internalKey) {
    // If already prefixed, leave as-is. Otherwise, prepend for current docId.
    if (typeof internalKey !== "string") return internalKey;
    if (internalKey.startsWith("__gosdoc__")) return internalKey;
    return `__gosdoc__${docId}__::${internalKey}`;
  }

  async function overwriteReportState({ entries, lCaseId /*, lDocId */ }) {
    const currentInfo = readDocInfoFromIframeDom();
    if (!currentInfo?.caseId || !currentInfo?.docId) {
      throw new Error("Could not determine current report case/doc info");
    }
    const { caseId: oCaseId, docId: oDocId } = currentInfo;

    if (lCaseId !== oCaseId) {
      throw new Error(`Case mismatch: uploaded ${lCaseId} vs current ${oCaseId}`);
    }

    const db = await idbOpen().catch(() => {
      throw new Error("Report storage is not available (IndexedDB open failed)");
    });

    // All keys for the current document in IDB are prefixed with this:
    const oPrefix = `__gosdoc__${oDocId}__::`;

    const allKeys = await idbAllKeys(db);
    const oKeys = allKeys.filter(
      (k) => typeof k === "string" && k.startsWith(oPrefix)
    );

    // Internal keys currently in IDB for this doc
    const existingInternal = new Set(oKeys.map((k) => stripGosdocPrefix(k)));

    // Prepare upserts: for uploaded keys, always write to the prefixed key
    const puts = [];
    const lInternalSet = new Set();

    for (const [lKey, lVal] of Object.entries(entries)) {
      // If the uploaded key is already prefixed, keep it; else prefix it for current doc
      let internal = stripGosdocPrefix(lKey);
      let targetKey;

      if (lKey.startsWith("__gosdoc__")) {
        targetKey = lKey;
      } else if (lKey.startsWith("gos.")) {
        targetKey = ensurePrefixedForDoc(oDocId, lKey);
        internal = lKey; // true internal part is the original uploaded key
      } else {
        // Non-gos/system key: write as-is (do not prefix)
        targetKey = lKey;
        internal = stripGosdocPrefix(lKey);
      }

      // Derive the new value to store in the "v" field
      const newV =
        lVal && typeof lVal === "object"
          ? ("value" in lVal ? lVal.value : "v" in lVal ? lVal.v : lVal)
          : lVal;

      let recordToPut = lVal;

      // Only transform gosdoc records for the currently open document
      if (typeof targetKey === "string" && targetKey.startsWith(oPrefix)) {
        const oldRecord = await idbGet(db, targetKey).catch(() => null);

        if (oldRecord && typeof oldRecord === "object") {
          // Preserve old shape; just update v
          recordToPut = { ...oldRecord, v: newV };
        } else {
          // Fall back to a minimally correct object
          recordToPut = {
            k: targetKey,
            key: internal,
            ns: oDocId,
            v: newV,
          };
        }

        lInternalSet.add(internal);
      }

      puts.push([targetKey, recordToPut]);
    }

    // Delete keys in current doc that are not present in uploaded entries (by internal key)
    const dels = [];
    for (const k of oKeys) {
      const internal = stripGosdocPrefix(k);
      if (!lInternalSet.has(internal)) {
        dels.push(k);
      }
    }

    await idbDelMany(db, dels);
    await idbPutMany(db, puts);
  }


  const [importing, setImporting] = useState(false);

  function genNonce() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function parseHtmlForMetaAndState(text) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    const caseMeta = doc.querySelector('meta[name="gos-case-id"]');
    const docMeta = doc.querySelector('meta[name="gos-doc-id"]');
    const stateEl = doc.getElementById("gos-state-json");
    const caseId = caseMeta?.getAttribute("content")?.trim() || null;
    const docId = docMeta?.getAttribute("content")?.trim() || null;

    if (!stateEl) {
      throw new Error("Missing <script id='gos-state-json'> in uploaded HTML");
    }
    const type = stateEl.getAttribute("type") || "";
    if (type !== "application/json") {
      throw new Error("gos-state-json script must have type='application/json'");
    }
    let stateJson;
    try {
      stateJson = JSON.parse(stateEl.textContent || "{}");
    } catch (e) {
      throw new Error("Failed to parse gos-state-json payload");
    }
    return { caseId, docId, stateJson };
  }

  function readDocInfoFromIframeDom() {
    try {
      const cw = iframeRef.current?.contentWindow;
      const doc = cw?.document;
      if (!doc) return null;
      const caseId = doc.querySelector('meta[name="gos-case-id"]')?.content?.trim();
      const docId = doc.querySelector('meta[name="gos-doc-id"]')?.content?.trim();
      if (caseId && docId) return { caseId, docId };
      return null;
    } catch (_) {
      return null;
    }
  }



  async function getCurrentDocInfo() {
    return readDocInfoFromIframeDom();
  }

  async function handleUploadedFile(file) {
    if (!iframeRef.current || reportLoading || error) {
      message.error("Report is not loaded yet. Open the Report tab and try again.");
      return;
    }
    try {
      setImporting(true);

      const text = await file.text();
      const { caseId: lCaseId, docId: lDocId, stateJson } = parseHtmlForMetaAndState(text);

      if (!lCaseId) throw new Error("Uploaded file missing gos-case-id");
      if (!lDocId) throw new Error("Uploaded file missing gos-doc-id");
      if (!stateJson || typeof stateJson !== "object") throw new Error("Uploaded file has no valid state JSON");

      const entries = stateJson.entries || {};
      if (!entries || typeof entries !== "object") {
        throw new Error("Invalid state JSON: missing 'entries' object");
      }

      await overwriteReportState({
        entries,
        lCaseId,
        lDocId,
      });

      // Reload visible report to rehydrate from IndexedDB
      try {
        const cw = iframeRef.current?.contentWindow;
        cw?.location?.reload();
      } catch (_) {
        // ignore
      }

      message.success("Report state imported successfully");
    } catch (e) {
      message.error(e?.message || "Failed to import report");
    } finally {
      setImporting(false);
    }
  }

  const applyAnchor = (hashOverride) => {
    const el = iframeRef.current;
    if (!el) return;
    try {
      const cw = el.contentWindow;
      const doc = cw?.document;
      if (!doc) return;

      const rawHash =
        hashOverride ??
        (cw?.location?.hash ? cw.location.hash.slice(1) : null) ??
        (typeof src === "string" && src.includes("#")
          ? src.split("#")[1]
          : null);

      if (!rawHash) return;

      const anchor = decodeURIComponent(rawHash.replace(/^#+/, "")).trim();
      const target =
        doc.getElementById(anchor) || doc.getElementsByName(anchor)?.[0];

      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({
          block: "start",
          inline: "nearest",
          behavior: "auto",
        });
      } else if (cw && typeof cw.location !== "undefined") {
        cw.location.hash = `#${anchor}`;
      }
    } catch (_) {
      // ignore cross-origin issues
    }
  };

  const scheduleAnchorApply = () => {
    const el = iframeRef.current;
    if (!el) return;

    let hash = null;
    if (typeof src === "string" && src.includes("#")) {
      hash = src.split("#")[1];
    } else {
      try {
        hash = el.contentWindow?.location?.hash?.slice(1) || null;
      } catch (_) {}
    }
    if (!hash) return;

    // clear previous timers
    anchorTimersRef.current.forEach(clearTimeout);
    anchorTimersRef.current = [];

    // try multiple times to catch post-load DOM changes/reordering
    [0, 150, 300].forEach((delay) => {
      anchorTimersRef.current.push(
        setTimeout(() => applyAnchor(hash), delay)
      );
    });
  };

  const handleIframeLoad = () => {
    scheduleAnchorApply();
  };

  useEffect(() => {
    let aborted = false;
    if (!open || !src) return;

    setReportLoading(true);
    setError(null);

    fetch(src, { method: "HEAD" })
      .then((res) => {
        if (aborted) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setReportLoading(false);
      })
      .catch((e) => {
        if (aborted) return;
        setError(e.message || "Failed to load report");
        setReportLoading(false);
      });

    return () => {
      aborted = true;
      anchorTimersRef.current.forEach(clearTimeout);
      anchorTimersRef.current = [];
    };
  }, [open, src]);

  useEffect(() => {
    if (!open) setActiveTab("report");
  }, [open]);

  useEffect(() => {
    if (open && activeTab === "report" && !reportLoading && !error) {
      const id = setTimeout(() => {
        scheduleAnchorApply();
      }, 0);
      return () => clearTimeout(id);
    }
  }, [open, activeTab, reportLoading, error]);

  const renderSummary = () => {
    if (!record) return null;
    const {
      gene,
      tier,
      effect,
      gene_summary,
      effect_description,
      variant_summary,
      resistances,
      therapeutics,
      prognoses,
    } = record;

    return (
      <Row className="ant-panel-container ant-home-plot-container" gutter={[16, 24]}>
        <Col className="gutter-row" span={24}>
          <Descriptions
            title={t("components.filtered-events-panel.info")}
            bordered
            layout="vertical"
          >
            <Item label={t("components.filtered-events-panel.gene")}>
              {gene ? (
                <a
                  href="#/"
                  onClick={(e) => {
                    e.preventDefault();
                    window
                      .open(
                        `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${gene}`,
                        "_blank"
                      )
                      .focus();
                  }}
                >
                  {gene}
                </a>
              ) : (
                <Text italic disabled>{t("general.unavailable")}</Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.tier")}>
              {tier ? (
                <Space>
                  <Avatar
                    size="small"
                    style={{
                      color: "#FFF",
                      backgroundColor: tierColor(+tier),
                    }}
                  >
                    {tier}
                  </Avatar>
                  {t(`components.filtered-events-panel.tier-info.${tier}`)}
                </Space>
              ) : (
                <Text italic disabled>{t("general.unavailable")}</Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.effect")}>
              {effect ? (
                effect
              ) : (
                <Text italic disabled>{t("general.unavailable")}</Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.gene_summary")}>
              {gene_summary ? (
                gene_summary
              ) : (
                <Text italic disabled>{t("general.unavailable")}</Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.effect_description")}>
              {effect_description ? (
                effect_description
              ) : (
                <Text italic disabled>{t("general.unavailable")}</Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.variant_summary")}>
              {variant_summary ? (
                variant_summary
              ) : (
                <Text italic disabled>{t("general.unavailable")}</Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.resistances")}>
              {resistances ? (
                resistances
              ) : (
                <Text italic disabled>{t("general.unavailable")}</Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.therapeutics")}>
              {therapeutics ? (
                therapeutics
              ) : (
                <Text italic disabled>{t("general.unavailable")}</Text>
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.prognoses")}>
              {prognoses ? (
                prognoses
              ) : (
                <Text italic disabled>{t("general.unavailable")}</Text>
              )}
            </Item>
          </Descriptions>
        </Col>
      </Row>
    );
  };

  const mainTab = showSummaryFallback
    ? {
        key: "summary",
        label: "Summary",
        children: renderSummary(),
      }
    : {
        key: "report",
        label: "Report",
        children: error ? (
          <Alert
            type="error"
            message="Unable to load report.html"
            description={error}
            showIcon
          />
        ) : (
          <div className="report-container">
            {reportLoading && (
              <div className="report-loading">
                <Spin />
              </div>
            )}
            {!reportLoading && (
              <iframe
                ref={iframeRef}
                tabIndex={-1}
                onLoad={handleIframeLoad}
                title="report"
                src={src}
                className="report-iframe"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
              />
            )}
          </div>
        ),
      };

  return (
    <Wrapper>
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        title={title}
        width="95vw"
        getContainer={false}
      >
        <div className="report-toolbar">
          <Upload
            accept=".html,.htm"
            showUploadList={false}
            disabled={importing || reportLoading || !!error}
            beforeUpload={(file) => {
              // intercept and handle manually
              handleUploadedFile(file);
              return false; // prevent auto upload
            }}
          >
            <Button type="primary" loading={importing}>
              Load saved report
            </Button>
          </Upload>
        </div>
        <Tabs
          className="report-tabs"
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            mainTab,
            {
              key: "plots",
              label: "Plots",
              children: (
                <div className="plots-container">
                  <TracksModal
                    {...{
                      loading: genome?.loading ?? loading,
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
                      modalTitle: "",
                      genomePlotTitle: t("components.tracks-modal.genome-plot"),
                      genomePlotYAxisTitle: t(
                        "components.tracks-modal.genome-y-axis-title"
                      ),
                      coveragePlotTitle: t("components.tracks-modal.coverage-plot"),
                      coverageYAxisTitle: t(
                        "components.tracks-modal.coverage-y-axis-title"
                      ),
                      coverageYAxis2Title: t(
                        "components.tracks-modal.coverage-y-axis2-title"
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
                      hetsnpPlotTitle: t("components.tracks-modal.hetsnp-plot"),
                      hetsnpPlotYAxisTitle: t(
                        "components.tracks-modal.hetsnp-plot-y-axis-title"
                      ),
                      hetsnpPlotYAxis2Title: t(
                        "components.tracks-modal.hetsnp-plot-y-axis2-title"
                      ),
                      mutationsPlotTitle: t("components.tracks-modal.mutations-plot"),
                      mutationsPlotYAxisTitle: t(
                        "components.tracks-modal.mutations-plot-y-axis-title"
                      ),
                      allelicPlotTitle: t("components.tracks-modal.allelic-plot"),
                      allelicPlotYAxisTitle: t(
                        "components.tracks-modal.allelic-plot-y-axis-title"
                      ),
                      handleOkClicked: () => {},
                      handleCancelClicked: () => {},
                      open: true,
                      viewType: "inline",
                      showVariants: showVariants ?? !!selectedVariantId,
                      selectedVariantId,
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </Wrapper>
  );
}
export default withTranslation("common")(ReportModal);
