import React from "react";
import { Drawer } from "antd";
import GeneInfoCard from "./geneInfoCard";

/** Drawer with the gene card for a gene label clicked in an expression heatmap. `row` / `labels`: its DE result, if any. */
export default function GeneInfoDrawer({ gene, onClose, row, labels }) {
  return (
    <Drawer open={!!gene} onClose={onClose} width={460} title={gene} destroyOnClose>
      {gene && <GeneInfoCard gene={gene} row={row || undefined} labels={row ? labels : undefined} />}
    </Drawer>
  );
}
