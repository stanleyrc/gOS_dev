import React, { Component } from "react";
import PropTypes from "prop-types";
import Konva from "konva";
import { parseDriverGenes } from "../../helpers/geneAggregations";

const ALTERATION_COLORS = {
  missense: "#3498db",
  trunc: "#2ecc71",
  splice: "#9b59b6",
  homdel: "#e74c3c",
  amp: "#e67e22",
  fusion: "#1abc9c",
  default: "#95a5a6",
};

class OncoPrintPlot extends Component {
  containerRef = null;
  stage = null;
  layer = null;
  tooltipGroup = null;
  highlightRect = null;

  // Layout params for coordinate-based hit detection
  layoutParams = null;

  // Pending render frame ID for cleanup
  pendingRenderFrame = null;

  // Cache for parsed driver genes (keyed by record)
  parsedGenesCache = new WeakMap();

  // Memoization for computeOncoPrintData
  cachedOncoPrintData = null;
  cachedFilteredRecords = null;
  cachedGeneSet = null;

  state = {
    loading: true,
  };

  componentDidMount() {
    this.initializeStage();
    this.scheduleRender();
  }

  componentDidUpdate(prevProps) {
    const { width, height, filteredRecords, geneSet } = this.props;

    if (
      width !== prevProps.width ||
      height !== prevProps.height ||
      filteredRecords !== prevProps.filteredRecords ||
      geneSet !== prevProps.geneSet
    ) {
      if (width !== prevProps.width || height !== prevProps.height) {
        this.handleResize();
      } else {
        this.scheduleRender();
      }
    }
  }

  componentWillUnmount() {
    if (this.pendingRenderFrame) {
      cancelAnimationFrame(this.pendingRenderFrame);
    }
    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
    }
  }

  scheduleRender() {
    if (this.pendingRenderFrame) {
      cancelAnimationFrame(this.pendingRenderFrame);
    }

    this.setState({ loading: true }, () => {
      this.pendingRenderFrame = requestAnimationFrame(() => {
        this.pendingRenderFrame = null;
        this.renderOncoPrint();
        this.setState({ loading: false });
      });
    });
  }

  initializeStage() {
    const { width, height } = this.props;

    if (!this.containerRef || width <= 0 || height <= 0) return;

    this.stage = new Konva.Stage({
      container: this.containerRef,
      width,
      height,
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    // Tooltip layer
    this.tooltipLayer = new Konva.Layer({ listening: false });
    this.stage.add(this.tooltipLayer);
    this.initializeTooltip();

    this.stage.on("mousemove", this.handleMouseMove);
    this.stage.on("mouseleave", this.handleMouseLeave);
    this.stage.on("click", this.handleCellClick);
  }

  initializeTooltip() {
    this.tooltipGroup = new Konva.Group({ visible: false });

    this.tooltipRect = new Konva.Rect({
      fill: "rgba(0, 0, 0, 0.85)",
      cornerRadius: 4,
    });

    this.tooltipText = new Konva.Text({
      fill: "#fff",
      fontSize: 12,
      padding: 6,
      lineHeight: 1.4,
    });

    this.tooltipGroup.add(this.tooltipRect);
    this.tooltipGroup.add(this.tooltipText);
    this.tooltipLayer.add(this.tooltipGroup);

    // Highlight rect for hover feedback
    this.highlightRect = new Konva.Rect({
      visible: false,
      stroke: "#ffcc00",
      strokeWidth: 2,
      fill: "transparent",
      listening: false,
    });
    this.tooltipLayer.add(this.highlightRect);
  }

  handleResize() {
    const { width, height } = this.props;

    if (!this.stage) {
      this.initializeStage();
      this.scheduleRender();
      return;
    }

    this.stage.size({ width, height });
    this.scheduleRender();
  }

  getCellFromPosition(mouseX, mouseY) {
    if (!this.layoutParams) return null;

    const { margins, cellWidth, cellHeight, cellGap, genes, pairs, matrix } = this.layoutParams;

    const relX = mouseX - margins.left;
    const relY = mouseY - margins.top;

    if (relX < 0 || relY < 0) return null;

    const pairIdx = Math.floor(relX / (cellWidth + cellGap));
    const geneIdx = Math.floor(relY / (cellHeight + cellGap));

    if (pairIdx < 0 || pairIdx >= pairs.length || geneIdx < 0 || geneIdx >= genes.length) {
      return null;
    }

    const gene = genes[geneIdx];
    const pair = pairs[pairIdx];
    const key = `${gene.toUpperCase()},${pair}`;
    const alterations = matrix.get(key) || [];

    return {
      gene,
      pair,
      alterations,
      geneIdx,
      pairIdx,
    };
  }

  handleMouseMove = (evt) => {
    const mousePos = this.stage.getPointerPosition();
    if (!mousePos) return;

    const cellData = this.getCellFromPosition(mousePos.x, mousePos.y);

    if (!cellData) {
      if (this.tooltipGroup) {
        this.tooltipGroup.visible(false);
      }
      if (this.highlightRect) {
        this.highlightRect.visible(false);
      }
      this.tooltipLayer.batchDraw();
      this.stage.container().style.cursor = "default";
      return;
    }

    this.stage.container().style.cursor = "pointer";

    const { gene, pair, alterations, geneIdx, pairIdx } = cellData;
    const { margins, cellWidth, cellHeight, cellGap } = this.layoutParams;

    // Position highlight rect
    const cellX = margins.left + pairIdx * (cellWidth + cellGap);
    const cellY = margins.top + geneIdx * (cellHeight + cellGap);
    this.highlightRect.position({ x: cellX, y: cellY });
    this.highlightRect.size({ width: cellWidth, height: cellHeight });
    this.highlightRect.visible(true);

    const altText =
      alterations && alterations.length > 0
        ? alterations.map((a) => a.type).join(", ")
        : "No alteration";

    const textContent = `${pair}\n${gene}\n${altText}`;
    this.tooltipText.text(textContent);

    const textWidth = this.tooltipText.width();
    const textHeight = this.tooltipText.height();
    this.tooltipRect.size({ width: textWidth, height: textHeight });

    const { width, height } = this.props;

    const xPos =
      mousePos.x + 10 + textWidth > width ? mousePos.x - textWidth - 10 : mousePos.x + 10;
    const yPos =
      mousePos.y + 10 + textHeight > height ? mousePos.y - textHeight - 10 : mousePos.y + 10;

    this.tooltipGroup.position({ x: xPos, y: yPos });
    this.tooltipGroup.visible(true);
    this.tooltipLayer.batchDraw();
  };

  handleMouseLeave = () => {
    if (this.tooltipGroup) {
      this.tooltipGroup.visible(false);
    }
    if (this.highlightRect) {
      this.highlightRect.visible(false);
    }
    this.tooltipLayer.batchDraw();
    this.stage.container().style.cursor = "default";
  };

  handleCellClick = (evt) => {
    const { onPairClick } = this.props;
    if (!onPairClick) return;

    const mousePos = this.stage.getPointerPosition();
    if (!mousePos) return;

    const cellData = this.getCellFromPosition(mousePos.x, mousePos.y);
    if (cellData && cellData.pair) {
      onPairClick(cellData);
    }
  };

  getParsedGenes(record) {
    if (this.parsedGenesCache.has(record)) {
      return this.parsedGenesCache.get(record);
    }
    const parsed = parseDriverGenes(record.summary);
    this.parsedGenesCache.set(record, parsed);
    return parsed;
  }

  computeOncoPrintData() {
    const { filteredRecords, geneSet } = this.props;

    if (!geneSet || geneSet.length === 0) {
      return { genes: [], pairs: [], matrix: new Map() };
    }

    if (
      this.cachedOncoPrintData &&
      this.cachedFilteredRecords === filteredRecords &&
      this.cachedGeneSet === geneSet
    ) {
      return this.cachedOncoPrintData;
    }

    const genes = geneSet.slice();
    const pairs = filteredRecords.map((r) => r.pair).filter(Boolean);
    const matrix = new Map();

    const geneSetUpper = new Set(genes.map((g) => g.toUpperCase()));

    filteredRecords.forEach((record) => {
      const parsedGenes = this.getParsedGenes(record);
      parsedGenes.forEach(({ gene, type }) => {
        if (geneSetUpper.has(gene)) {
          const key = `${gene},${record.pair}`;
          if (!matrix.has(key)) {
            matrix.set(key, []);
          }
          matrix.get(key).push({ gene, type });
        }
      });
    });

    this.cachedOncoPrintData = { genes, pairs, matrix };
    this.cachedFilteredRecords = filteredRecords;
    this.cachedGeneSet = geneSet;

    return this.cachedOncoPrintData;
  }

  renderOncoPrint() {
    if (!this.layer) {
      return;
    }

    const { width, height } = this.props;
    const { genes, pairs, matrix } = this.computeOncoPrintData();

    this.layer.destroyChildren();

    if (genes.length === 0 || pairs.length === 0) {
      this.layoutParams = null;
      const text = new Konva.Text({
        x: width / 2 - 100,
        y: height / 2 - 10,
        text: "No data to display. Select a gene set with driver genes.",
        fontSize: 14,
        fill: "#999",
      });
      this.layer.add(text);
      this.layer.batchDraw();
      return;
    }

    const margins = { top: 30, right: 20, bottom: 60, left: 100 };
    const innerWidth = width - margins.left - margins.right;
    const innerHeight = height - margins.top - margins.bottom;

    // Cell dimensions
    const cellWidth = Math.max(2, Math.min(20, innerWidth / pairs.length));
    const cellHeight = Math.max(12, Math.min(30, innerHeight / genes.length));
    const cellGap = 1;

    // Store layout params for coordinate-based hit detection
    this.layoutParams = {
      margins,
      cellWidth,
      cellHeight,
      cellGap,
      genes,
      pairs,
      matrix,
    };

    // Gene labels (Y-axis)
    genes.forEach((gene, geneIdx) => {
      const text = new Konva.Text({
        x: 5,
        y: margins.top + geneIdx * (cellHeight + cellGap) + cellHeight / 2 - 6,
        text: gene,
        fontSize: 11,
        fill: "#333",
        width: margins.left - 10,
        align: "right",
      });
      this.layer.add(text);
    });

    // Pair labels (X-axis) - only show if space allows
    if (cellWidth >= 8) {
      pairs.forEach((pair, pairIdx) => {
        const text = new Konva.Text({
          x: margins.left + pairIdx * (cellWidth + cellGap) + cellWidth / 2,
          y: margins.top + genes.length * (cellHeight + cellGap) + 5,
          text: pair,
          fontSize: 9,
          fill: "#666",
          rotation: 45,
        });
        this.layer.add(text);
      });
    }

    // Matrix cells
    genes.forEach((gene, geneIdx) => {
      pairs.forEach((pair, pairIdx) => {
        const key = `${gene.toUpperCase()},${pair}`;
        const alterations = matrix.get(key) || [];
        const x = margins.left + pairIdx * (cellWidth + cellGap);
        const y = margins.top + geneIdx * (cellHeight + cellGap);

        if (alterations.length === 0) {
          // Empty cell
          const rect = new Konva.Rect({
            x,
            y,
            width: cellWidth,
            height: cellHeight,
            fill: "#f0f0f0",
            stroke: "#e0e0e0",
            strokeWidth: 0.5,
          });
          rect.setAttr("cellData", { gene, pair, alterations: [] });
          this.layer.add(rect);
        } else {
          // Multi-alteration cell: stack colors vertically
          const altTypes = [...new Set(alterations.map((a) => a.type))];
          const segmentHeight = cellHeight / altTypes.length;

          altTypes.forEach((altType, altIdx) => {
            const rect = new Konva.Rect({
              x,
              y: y + altIdx * segmentHeight,
              width: cellWidth,
              height: segmentHeight,
              fill: ALTERATION_COLORS[altType] || ALTERATION_COLORS.default,
              stroke: "#fff",
              strokeWidth: 0.5,
            });
            rect.setAttr("cellData", { gene, pair, alterations });
            this.layer.add(rect);
          });
        }
      });
    });

    this.layer.batchDraw();
  }

  render() {
    const { width, height } = this.props;
    const { loading } = this.state;

    return (
      <div style={{ position: "relative", width, height, overflow: "auto" }}>
        <div
          ref={(ref) => (this.containerRef = ref)}
          style={{ width, height }}
        />
        {loading && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width,
              height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255, 255, 255, 0.8)",
              zIndex: 10,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: "3px solid #e0e0e0",
                  borderTopColor: "#3498db",
                  borderRadius: "50%",
                  animation: "oncoPrintSpin 0.8s linear infinite",
                  margin: "0 auto 8px",
                }}
              />
              <div style={{ color: "#666", fontSize: 13 }}>Loading OncoPrint...</div>
            </div>
            <style>
              {`@keyframes oncoPrintSpin { to { transform: rotate(360deg); } }`}
            </style>
          </div>
        )}
      </div>
    );
  }
}

OncoPrintPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  filteredRecords: PropTypes.array.isRequired,
  geneSet: PropTypes.array.isRequired,
  onPairClick: PropTypes.func,
};

OncoPrintPlot.defaultProps = {
  onPairClick: null,
};

export default OncoPrintPlot;
