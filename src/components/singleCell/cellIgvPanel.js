import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { Alert, Button, Card, Space, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import igv from "../../../node_modules/igv/dist/igv.esm.min.js";
import singleCellActions, { SC_MAX_TRACK_CELLS } from "../../redux/singleCell/actions";
import { casePath } from "../../redux/singleCell/loaders";
import Wrapper from "./index.style";

const { Text } = Typography;
const WINDOW = 60; // bp either side of the clicked site
export const SC_READS_FILE = "reads.bam";

let genomeListPromise = null;
const loadGenomeList = () => {
  if (!genomeListPromise) {
    genomeListPromise = axios.get("igvGenomes.json").then((r) => r.data);
    genomeListPromise.catch(() => (genomeListPromise = null));
  }
  return genomeListPromise;
};

const chr = (c) => (`${c}`.startsWith("chr") ? `${c}` : `chr${c}`);

/**
 * Reads for one or more cells at a site (opened by clicking a mutation in the
 * heatmaps). Each cell folder holds reads.bam (+ .bai): reads around the
 * patient's mutation sites and the cell's junction breakpoints, cut from the
 * cell's full alignment so it can be served from the web folder.
 */
export default function CellIgvPanel() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const view = useSelector((state) => state.SingleCell.igv);
  const selectedCellIds = useSelector((state) => state.SingleCell.selectedCellIds);
  const dataset = useSelector((state) => state.Settings.dataset);
  const reference = dataset?.reference || "hg38";
  const containerRef = useRef(null);
  const browserRef = useRef(null);
  const [error, setError] = useState(null);

  const locus = view ? `${chr(view.chromosome)}:${Math.max(1, view.position - WINDOW)}-${view.position + WINDOW}` : null;
  const cellIds = view ? view.cellIds.slice(0, SC_MAX_TRACK_CELLS) : [];
  const key = cellIds.join("|");

  useEffect(() => {
    if (!view || !containerRef.current) return undefined;
    let cancelled = false;
    const tracks = cellIds.map((cellId) => ({
      id: cellId,
      name: cellId,
      url: casePath(dataset, cellId, SC_READS_FILE),
      indexURL: casePath(dataset, cellId, `${SC_READS_FILE}.bai`),
      format: "bam",
      type: "alignment",
      height: 260,
      sort: { chr: chr(view.chromosome), position: view.position, option: "BASE", direction: "ASC" },
    }));
    const run = async () => {
      try {
        setError(null);
        if (!browserRef.current) {
          const genomeList = await loadGenomeList();
          if (cancelled) return;
          // The genome list's hg38 entry carries genome-wide annotation tracks
          // (RefSeq, ~20 MB); reads around one site don't need them.
          const entry = (genomeList || []).find((g) => g.id === reference);
          browserRef.current = await igv.createBrowser(containerRef.current, {
            genome: entry ? { ...entry, tracks: [] } : reference,
            loadDefaultGenomes: false,
            locus,
            tracks,
            showCenterGuide: true,
            minimumBases: 1,
          });
          return;
        }
        const browser = browserRef.current;
        const loaded = (browser.findTracks ? browser.findTracks("type", "alignment") : []).map((tr) => tr.id);
        loaded.filter((id) => !cellIds.includes(id)).forEach((id) => browser.removeTrackByName(id));
        const fresh = tracks.filter((tr) => !loaded.includes(tr.id));
        if (fresh.length) await browser.loadTrackList(fresh);
        await browser.search(locus);
      } catch (e) {
        if (!cancelled) setError(e?.message || `${e}`);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, locus, view != null]);

  // Tear the browser down when the panel closes.
  useEffect(() => {
    if (view) return undefined;
    if (browserRef.current) {
      igv.removeBrowser(browserRef.current);
      browserRef.current = null;
    }
    return undefined;
  }, [view]);
  useEffect(
    () => () => {
      if (browserRef.current) igv.removeBrowser(browserRef.current);
      browserRef.current = null;
    },
    []
  );

  if (!view) return null;
  const others = selectedCellIds.filter((id) => !cellIds.includes(id));
  return (
    <Wrapper>
      <Card
        size="small"
        title={
          <Space wrap>
            <span>{t("components.single-cell.igv.title")}</span>
            <Text type="secondary">
              {view.label} · {cellIds.join(", ")}
            </Text>
          </Space>
        }
        extra={
          <Space>
            {others.length > 0 && (
              <Button
                size="small"
                onClick={() =>
                  dispatch(singleCellActions.openIgv({ ...view, cellIds: [...cellIds, ...others].slice(0, SC_MAX_TRACK_CELLS) }))
                }
              >
                {t("components.single-cell.igv.add-selected", { count: Math.min(others.length, SC_MAX_TRACK_CELLS - cellIds.length) })}
              </Button>
            )}
            <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => dispatch(singleCellActions.closeIgv())} />
          </Space>
        }
      >
        <Text type="secondary" className="sc-hint">
          {t("components.single-cell.igv.note")}
        </Text>
        {error && <Alert type="warning" showIcon className="sc-alert" message={error} />}
        <div ref={containerRef} className="sc-igv" />
      </Card>
    </Wrapper>
  );
}
