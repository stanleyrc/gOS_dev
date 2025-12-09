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

  componentDidMount() {
    this.initializeStage();
    this.renderOncoPrint();
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
        this.renderOncoPrint();
      }
    }
  }

  componentWillUnmount() {
    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
    }
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
  }

  handleResize() {
    const { width, height } = this.props;

    if (!this.stage) {
      this.initializeStage();
      this.renderOncoPrint();
      return;
    }

    this.stage.size({ width, height });
    this.renderOncoPrint();
  }

  handleMouseMove = (evt) => {
    const node = evt.target;
    const cellData = node.getAttr ? node.getAttr("cellData") : null;

    if (!cellData) {
      if (this.tooltipGroup) {
        this.tooltipGroup.visible(false);
        this.tooltipLayer.batchDraw();
      }
      this.stage.container().style.cursor = "default";
      return;
    }

    this.stage.container().style.cursor = "pointer";

    const { gene, pair, alterations } = cellData;
    const altText =
      alterations && alterations.length > 0
        ? alterations.map((a) => a.type).join(", ")
        : "No alteration";

    const textContent = `${pair}\n${gene}\n${altText}`;
    this.tooltipText.text(textContent);

    const textWidth = this.tooltipText.width();
    const textHeight = this.tooltipText.height();
    this.tooltipRect.size({ width: textWidth, height: textHeight });

    const mousePos = this.stage.getPointerPosition();
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
      this.tooltipLayer.batchDraw();
    }
    this.stage.container().style.cursor = "default";
  };

  handleCellClick = (evt) => {
    const { onPairClick } = this.props;
    const node = evt.target;
    const cellData = node.getAttr ? node.getAttr("cellData") : null;

    if (cellData && onPairClick && cellData.pair) {
      onPairClick(cellData);
    }
  };

  computeOncoPrintData() {
    const { filteredRecords, geneSet } = this.props;

    if (!geneSet || geneSet.length === 0) {
      return { genes: [], pairs: [], matrix: new Map() };
    }

    const genes = geneSet.slice();
    const pairs = filteredRecords.map((r) => r.pair).filter(Boolean);
    const matrix = new Map();

    filteredRecords.forEach((record) => {
      const parsedGenes = parseDriverGenes(record.summary);
      genes.forEach((gene) => {
        const key = `${gene.toUpperCase()},${record.pair}`;
        const alterations = parsedGenes.filter((g) => g.gene === gene.toUpperCase());
        if (alterations.length > 0) {
          matrix.set(key, alterations);
        }
      });
    });

    return { genes, pairs, matrix };
  }

  renderOncoPrint() {
    if (!this.layer) {
      return;
    }

    const { width, height } = this.props;
    const { genes, pairs, matrix } = this.computeOncoPrintData();

    this.layer.destroyChildren();

    if (genes.length === 0 || pairs.length === 0) {
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

    return (
      <div style={{ position: "relative", width, height, overflow: "auto" }}>
        <div
          ref={(ref) => (this.containerRef = ref)}
          style={{ width, height }}
        />
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
