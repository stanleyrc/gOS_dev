import React, { useEffect, useState, useRef } from "react";
import { Modal, Spin, Alert, Tabs } from "antd";
import Wrapper from "./index.style";

export default function ReportModal({ open, onClose, src, title = "Report" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("report");

  const iframeRef = useRef(null);

  const focusIframe = () => {
    const el = iframeRef.current;
    if (!el) return;
    try {
      el.focus();
      el.contentWindow && el.contentWindow.focus && el.contentWindow.focus();
    } catch (_) {
      // ignore cross-origin focus errors
    }
  };

  useEffect(() => {
    let aborted = false;
    if (!open || !src) return;

    setLoading(true);
    setError(null);

    fetch(src, { method: "HEAD" })
      .then((res) => {
        if (aborted) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setLoading(false);
      })
      .catch((e) => {
        if (aborted) return;
        setError(e.message || "Failed to load report");
        setLoading(false);
      });

    return () => {
      aborted = true;
    };
  }, [open, src]);

  useEffect(() => {
    if (!open) setActiveTab("report");
  }, [open]);

  useEffect(() => {
    if (open && activeTab === "report" && !loading && !error) {
      const id = setTimeout(focusIframe, 0);
      return () => clearTimeout(id);
    }
  }, [open, activeTab, loading, error]);

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
        <Tabs
          className="report-tabs"
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
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
                  {loading && <div className="report-loading"><Spin /></div>}
                  {!loading && (
                    <iframe
                      ref={iframeRef}
                      tabIndex={-1}
                      onLoad={focusIframe}
                      title="report"
                      src={src}
                      className="report-iframe"
                      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
                    />
                  )}
                </div>
              ),
            },
            {
              key: "plots",
              label: "Plots",
              children: <div>Plots coming soon…</div>,
            },
          ]}
        />
      </Modal>
    </Wrapper>
  );
}
