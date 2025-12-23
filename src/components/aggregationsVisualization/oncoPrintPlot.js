import React, { Component } from "react";
import PropTypes from "prop-types";
import Konva from "konva";
import { parseDriverGenes } from "../../helpers/geneAggregations";
import signatureMetadata from "../../translations/en/signatures.json";

const ALTERATION_COLORS = {
  missense: "#3498db",
  trunc: "#2ecc71",
  splice: "#9b59b6",
  homdel: "#e74c3c",
  amp: "#e67e22",
  fusion: "#1abc9c",
  default: "#95a5a6",
};

const MAX_ROWS = 100;
const MIN_CELL_WIDTH = 2;
const MAX_CELL_WIDTH = 20;
const MIN_CELL_HEIGHT = 12;
const MAX_CELL_HEIGHT = 30;
const CELL_GAP = 1;
const MARGINS = { top: 30, right: 20, bottom: 60, left: 150 };
const VIRTUALIZATION_BUFFER = 50;

class OncoPrintPlot extends Component {
  containerRef = null;
  scrollContainerRef = null;
  stage = null;
  labelsLayer = null;
  heatmapLayer = null;
  heatmapShape = null;
  tooltipLayer = null;
  tooltipGroup = null;
  highlightRect = null;

  layoutParams = null;
  pendingRenderTimeout = null;
  scrollRafId = null;
  parsedGenesCache = new WeakMap();

  cachedOncoPrintData = null;
  cachedFilteredRecords = null;
  cachedGeneSet = null;
  cachedEnableMemoSort = null;
  cachedMode = null;
  cachedObjectAttribute = null;

  cachedGeneFrequencies = null;
  cachedFrequenciesRecords = null;
  cachedFrequenciesGeneSet = null;

  renderedColRange = { startCol: -1, endCol: -1 };
  currentScrollLeft = 0;

  state = {
    loading: true,
  };

  componentDidMount() {
    this.initializeStage();
    this.scheduleRender();
  }

  componentDidUpdate(prevProps) {
    const { width, height, filteredRecords, geneSet, enableMemoSort, mode, objectAttribute } = this.props;

    if (
      width !== prevProps.width ||
      height !== prevProps.height ||
      filteredRecords !== prevProps.filteredRecords ||
      geneSet !== prevProps.geneSet ||
      enableMemoSort !== prevProps.enableMemoSort ||
      mode !== prevProps.mode ||
      objectAttribute !== prevProps.objectAttribute
    ) {
      this.renderedColRange = { startCol: -1, endCol: -1 };
      if (width !== prevProps.width || height !== prevProps.height) {
        this.handleResize();
      } else {
        this.scheduleRender();
      }
    }
  }

  componentWillUnmount() {
    if (this.pendingRenderTimeout) {
      clearTimeout(this.pendingRenderTimeout);
    }
    if (this.scrollRafId) {
      cancelAnimationFrame(this.scrollRafId);
    }
    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
    }
  }

  scheduleRender() {
    if (this.pendingRenderTimeout) {
      clearTimeout(this.pendingRenderTimeout);
    }

    this.setState({ loading: true }, () => {
      this.pendingRenderTimeout = setTimeout(() => {
        this.pendingRenderTimeout = null;
        this.renderOncoPrint();
        this.setState({ loading: false });
      }, 50);
    });
  }

  getContentDimensions() {
    const { genes, pairs } = this.computeOncoPrintData();
    const { width, height } = this.props;
    
    const numRows = Math.min(genes.length, MAX_ROWS);
    const numCols = pairs.length;

    const innerWidth = width - MARGINS.left - MARGINS.right;
    const innerHeight = height - MARGINS.top - MARGINS.bottom;

    const cellWidth = Math.max(MIN_CELL_WIDTH, Math.min(MAX_CELL_WIDTH, innerWidth / numCols));
    const cellHeight = Math.max(MIN_CELL_HEIGHT, Math.min(MAX_CELL_HEIGHT, innerHeight / numRows));

    const contentHeight = MARGINS.top + numRows * (cellHeight + CELL_GAP) + MARGINS.bottom;
    const contentWidth = MARGINS.left + numCols * (cellWidth + CELL_GAP) + MARGINS.right;

    return { contentWidth, contentHeight, cellWidth, cellHeight, numRows, numCols };
  }

  initializeStage() {
    const { width, height } = this.props;

    if (!this.containerRef || width <= 0 || height <= 0) return;

    const { contentHeight } = this.getContentDimensions();
    const stageHeight = Math.max(height, contentHeight);

    this.stage = new Konva.Stage({
      container: this.containerRef,
      width,
      height: stageHeight,
    });

    this.heatmapLayer = new Konva.Layer();
    this.heatmapShape = new Konva.Shape({
      sceneFunc: (context, shape) => {
        this.drawHeatmapCells(context);
      },
    });
    this.heatmapLayer.add(this.heatmapShape);
    this.stage.add(this.heatmapLayer);

    this.labelsLayer = new Konva.Layer();
    this.stage.add(this.labelsLayer);

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

    const { contentHeight } = this.getContentDimensions();
    const stageHeight = Math.max(height, contentHeight);

    this.stage.size({ width, height: stageHeight });
    


    this.renderedColRange = { startCol: -1, endCol: -1 };
    this.scheduleRender();
  }

  handleScroll = (evt) => {
    const scrollLeft = evt.target.scrollLeft;
    this.currentScrollLeft = scrollLeft;

    if (this.scrollRafId) {
      cancelAnimationFrame(this.scrollRafId);
    }

    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = null;
      this.updateVisibleCells();
    });
  };

  updateVisibleCells() {
    if (!this.heatmapShape || !this.layoutParams) return;

    this.heatmapLayer.batchDraw();
  }

  isSignatureValue = (value) => {
    if (!value || typeof value !== 'string') return false;
    return /^(SBS|ID)\d+[a-z]?$/i.test(value);
  };

  getSignatureDescription = (signatureName) => {
    if (!signatureName) return null;
    const sig = signatureMetadata.metadata[signatureName];
    return sig?.full || null;
  };

  getVisibleColumnRange(scrollLeft = 0) {
    const { width } = this.props;
    const { pairs } = this.computeOncoPrintData();

    if (pairs.length === 0) return { startCol: 0, endCol: 0 };

    const { cellWidth } = this.getContentDimensions();
    const cellStep = cellWidth + CELL_GAP;

    const visibleStart = scrollLeft;
    const visibleEnd = scrollLeft + width - MARGINS.left;

    let startCol = Math.max(0, Math.floor(visibleStart / cellStep) - VIRTUALIZATION_BUFFER);
    let endCol = Math.min(pairs.length, Math.ceil(visibleEnd / cellStep) + VIRTUALIZATION_BUFFER);

    return { startCol, endCol };
  }

  getCellFromPosition(mouseX, mouseY) {
    if (!this.layoutParams) return null;

    const scrollLeft = this.currentScrollLeft;
    const { cellWidth, cellHeight, genes, pairs, matrix, isNumeric } = this.layoutParams;

    const adjustedMouseX = mouseX + scrollLeft;

    const relX = adjustedMouseX - MARGINS.left;
    const relY = mouseY - MARGINS.top;

    if (relX < 0 || relY < 0) return null;

    const pairIdx = Math.floor(relX / (cellWidth + CELL_GAP));
    const geneIdx = Math.floor(relY / (cellHeight + CELL_GAP));

    if (pairIdx < 0 || pairIdx >= pairs.length || geneIdx < 0 || geneIdx >= genes.length) {
      return null;
    }

    const gene = genes[geneIdx];
    const pair = pairs[pairIdx];

    if (isNumeric) {
      const key = `${gene},${pair}`;
      const value = matrix.get(key);
      return { gene, pair, value, isNumeric: true, geneIdx, pairIdx };
    } else {
      const key = `${gene.toUpperCase()},${pair}`;
      const alterations = matrix.get(key) || [];
      return { gene, pair, alterations, isNumeric: false, geneIdx, pairIdx };
    }
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

    const { gene, pair, geneIdx, pairIdx, isNumeric } = cellData;
    const scrollLeft = this.currentScrollLeft;
    const { cellWidth, cellHeight } = this.layoutParams;

    const cellX = MARGINS.left + pairIdx * (cellWidth + CELL_GAP) - scrollLeft;
    const cellY = MARGINS.top + geneIdx * (cellHeight + CELL_GAP);
    this.highlightRect.position({ x: cellX, y: cellY });
    this.highlightRect.size({ width: cellWidth, height: cellHeight });
    this.highlightRect.visible(true);

    let textContent;
    if (isNumeric) {
      const { value } = cellData;
      const valueText = value !== undefined && value !== null ? value.toFixed(3) : "No value";
      textContent = `${pair}\n${gene}\n${valueText}`;
      
      const pairSigDesc = this.getSignatureDescription(pair);
      if (pairSigDesc) {
        textContent += `\nAetiology: ${pairSigDesc}`;
      }
      const geneSigDesc = this.getSignatureDescription(gene);
      if (geneSigDesc) {
        textContent += `\nAetiology: ${geneSigDesc}`;
      }
    } else {
      const { alterations } = cellData;
      const altText =
        alterations && alterations.length > 0
          ? alterations.map((a) => a.type).join(", ")
          : "No alteration";
      textContent = `${pair}\n${gene}\n${altText}`;
      
      const pairSigDesc = this.getSignatureDescription(pair);
      if (pairSigDesc) {
        textContent += `\nAetiology: ${pairSigDesc}`;
      }
      const geneSigDesc = this.getSignatureDescription(gene);
      if (geneSigDesc) {
        textContent += `\nAetiology: ${geneSigDesc}`;
      }
    }

    this.tooltipText.text(textContent);

    const textWidth = this.tooltipText.width();
    const textHeight = this.tooltipText.height();
    this.tooltipRect.size({ width: textWidth, height: textHeight });

    const { width } = this.props;
    const stageHeight = this.stage.height();

    const xPos =
      mousePos.x + 10 + textWidth > width ? mousePos.x - textWidth - 10 : mousePos.x + 10;
    const yPos =
      mousePos.y + 10 + textHeight > stageHeight ? mousePos.y - textHeight - 10 : mousePos.y + 10;

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
    if (this.stage) {
      this.stage.container().style.cursor = "default";
    }
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

  computeMemoSort(genes, pairs, matrix) {
    const geneFreq = genes.map((gene) => {
      let count = 0;
      pairs.forEach((pair) => {
        if (matrix.has(`${gene.toUpperCase()},${pair}`)) {
          count++;
        }
      });
      return { gene, count };
    });
    geneFreq.sort((a, b) => b.count - a.count);
    const orderedGenes = geneFreq.map((g) => g.gene);

    const n = orderedGenes.length;
    const sampleScores = pairs.map((pair) => {
      let score = 0;
      orderedGenes.forEach((gene, i) => {
        if (matrix.has(`${gene.toUpperCase()},${pair}`)) {
          score += Math.pow(2, n - i);
        }
      });
      return { pair, score };
    });
    sampleScores.sort((a, b) => b.score - a.score);
    const orderedPairs = sampleScores.map((s) => s.pair);

    return { orderedGenes, orderedPairs };
  }

  computeOncoPrintData() {
    const { filteredRecords, geneSet, enableMemoSort, mode, objectAttribute } = this.props;

    if (mode === 'numeric' && objectAttribute) {
      return this.computeNumericOncoPrintData();
    }

    if (!geneSet || geneSet.length === 0) {
      return { genes: [], pairs: [], matrix: new Map(), isNumeric: false };
    }

    if (
      this.cachedOncoPrintData &&
      this.cachedFilteredRecords === filteredRecords &&
      this.cachedGeneSet === geneSet &&
      this.cachedEnableMemoSort === enableMemoSort &&
      this.cachedMode === mode
    ) {
      return this.cachedOncoPrintData;
    }

    const genes = geneSet.slice(0, MAX_ROWS);
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

    const pairsWithAlterations = pairs.filter((pair) => {
      return genes.some((gene) => matrix.has(`${gene.toUpperCase()},${pair}`));
    });

    let finalGenes = genes;
    let finalPairs = pairsWithAlterations;

    if (enableMemoSort && genes.length > 0 && finalPairs.length > 0) {
      const { orderedGenes, orderedPairs } = this.computeMemoSort(genes, finalPairs, matrix);
      finalGenes = orderedGenes;
      finalPairs = orderedPairs;
    }

    this.cachedOncoPrintData = { genes: finalGenes, pairs: finalPairs, matrix, isNumeric: false };
    this.cachedFilteredRecords = filteredRecords;
    this.cachedGeneSet = geneSet;
    this.cachedEnableMemoSort = enableMemoSort;
    this.cachedMode = mode;

    return this.cachedOncoPrintData;
  }

  computeNumericOncoPrintData() {
    const { filteredRecords, objectAttribute, enableMemoSort } = this.props;

    if (
      this.cachedOncoPrintData &&
      this.cachedFilteredRecords === filteredRecords &&
      this.cachedObjectAttribute === objectAttribute &&
      this.cachedEnableMemoSort === enableMemoSort &&
      this.cachedMode === 'numeric'
    ) {
      return this.cachedOncoPrintData;
    }

    const allKeys = new Set();
    filteredRecords.forEach((record) => {
      const objValue = record[objectAttribute];
      if (objValue && typeof objValue === 'object') {
        Object.keys(objValue).forEach((key) => {
          const val = objValue[key];
          if (typeof val === 'number' && val !== 0) {
            allKeys.add(key);
          }
        });
      }
    });

    const keys = Array.from(allKeys).sort().slice(0, MAX_ROWS);
    const pairs = filteredRecords.map((r) => r.pair).filter(Boolean);
    const matrix = new Map();

    filteredRecords.forEach((record) => {
      const objValue = record[objectAttribute];
      if (objValue && typeof objValue === 'object') {
        keys.forEach((key) => {
          const val = objValue[key];
          if (typeof val === 'number' && val !== 0) {
            const matrixKey = `${key},${record.pair}`;
            matrix.set(matrixKey, val);
          }
        });
      }
    });

    const pairsWithData = pairs.filter((pair) => {
      return keys.some((key) => matrix.has(`${key},${pair}`));
    });

    let finalKeys = keys;
    let finalPairs = pairsWithData;

    if (enableMemoSort && keys.length > 0 && finalPairs.length > 0) {
      const { orderedGenes, orderedPairs } = this.computeNumericMemoSort(keys, finalPairs, matrix);
      finalKeys = orderedGenes;
      finalPairs = orderedPairs;
    }

    this.cachedOncoPrintData = { genes: finalKeys, pairs: finalPairs, matrix, isNumeric: true };
    this.cachedFilteredRecords = filteredRecords;
    this.cachedObjectAttribute = objectAttribute;
    this.cachedEnableMemoSort = enableMemoSort;
    this.cachedMode = 'numeric';

    return this.cachedOncoPrintData;
  }

  computeNumericMemoSort(keys, pairs, matrix) {
    const keyFreqs = keys.map((key) => {
      let count = 0;
      pairs.forEach((pair) => {
        const val = matrix.get(`${key},${pair}`);
        if (typeof val === 'number' && val > 0) {
          count++;
        }
      });
      return { gene: key, count };
    });
    keyFreqs.sort((a, b) => b.count - a.count);
    const orderedGenes = keyFreqs.map((k) => k.gene);

    const n = orderedGenes.length;
    const sampleScores = pairs.map((pair) => {
      let score = 0;
      orderedGenes.forEach((key, i) => {
        const val = matrix.get(`${key},${pair}`);
        if (typeof val === 'number' && val > 0) {
          score += Math.pow(2, n - i);
        }
      });
      return { pair, score };
    });
    sampleScores.sort((a, b) => b.score - a.score);
    const orderedPairs = sampleScores.map((s) => s.pair);

    return { orderedGenes, orderedPairs };
  }

  computeGeneFrequencies(isNumeric = false, keys = []) {
    const { filteredRecords, geneSet, objectAttribute } = this.props;

    if (isNumeric && objectAttribute) {
      return this.computeNumericKeyFrequencies(keys);
    }

    if (!geneSet || geneSet.length === 0 || filteredRecords.length === 0) {
      return new Map();
    }

    if (
      this.cachedGeneFrequencies &&
      this.cachedFrequenciesRecords === filteredRecords &&
      this.cachedFrequenciesGeneSet === geneSet
    ) {
      return this.cachedGeneFrequencies;
    }

    const totalRecords = filteredRecords.length;
    const geneFrequencies = new Map();

    geneSet.forEach((gene) => {
      geneFrequencies.set(gene, 0);
    });

    filteredRecords.forEach((record) => {
      const parsedGenes = this.getParsedGenes(record);
      const genesInRecord = new Set(parsedGenes.map((g) => g.gene));

      geneSet.forEach((gene) => {
        if (genesInRecord.has(gene.toUpperCase())) {
          geneFrequencies.set(gene, geneFrequencies.get(gene) + 1);
        }
      });
    });

    geneSet.forEach((gene) => {
      const count = geneFrequencies.get(gene);
      const percentage = (count / totalRecords) * 100;
      geneFrequencies.set(gene, percentage);
    });

    this.cachedGeneFrequencies = geneFrequencies;
    this.cachedFrequenciesRecords = filteredRecords;
    this.cachedFrequenciesGeneSet = geneSet;

    return geneFrequencies;
  }

  computeNumericKeyFrequencies(keys) {
    const { filteredRecords, objectAttribute } = this.props;

    const totalRecords = filteredRecords.length;
    const keyFrequencies = new Map();

    keys.forEach((key) => {
      let count = 0;
      filteredRecords.forEach((record) => {
        const objValue = record[objectAttribute];
        if (objValue && typeof objValue === 'object') {
          const val = objValue[key];
          if (typeof val === 'number' && val > 0) {
            count++;
          }
        }
      });
      const percentage = totalRecords > 0 ? (count / totalRecords) * 100 : 0;
      keyFrequencies.set(key, percentage);
    });

    return keyFrequencies;
  }

  drawHeatmapCells(context) {
    if (!this.layoutParams) return;

    const { width } = this.props;
    const scrollLeft = this.currentScrollLeft;
    const { genes, pairs, matrix, isNumeric, cellWidth, cellHeight, colorScale } = this.layoutParams;
    const { startCol, endCol } = this.getVisibleColumnRange(scrollLeft);

    const ctx = context._context;
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(MARGINS.left, 0, width - MARGINS.left, this.stage.height());
    ctx.clip();

    genes.forEach((gene, geneIdx) => {
      for (let pairIdx = startCol; pairIdx < endCol; pairIdx++) {
        const pair = pairs[pairIdx];
        const key = isNumeric ? `${gene},${pair}` : `${gene.toUpperCase()},${pair}`;
        
        const contentX = MARGINS.left + pairIdx * (cellWidth + CELL_GAP);
        const viewportX = contentX - scrollLeft;
        const y = MARGINS.top + geneIdx * (cellHeight + CELL_GAP);

        if (isNumeric) {
          const val = matrix.get(key);
          const fill = colorScale(val);
          ctx.fillStyle = fill;
          ctx.fillRect(viewportX, y, cellWidth, cellHeight);
          ctx.strokeStyle = "#e0e0e0";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(viewportX, y, cellWidth, cellHeight);
        } else {
          const alterations = matrix.get(key) || [];
          if (alterations.length === 0) {
            ctx.fillStyle = "#f0f0f0";
            ctx.fillRect(viewportX, y, cellWidth, cellHeight);
            ctx.strokeStyle = "#e0e0e0";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(viewportX, y, cellWidth, cellHeight);
          } else {
            const altTypes = [...new Set(alterations.map((a) => a.type))];
            const segmentHeight = cellHeight / altTypes.length;

            altTypes.forEach((altType, altIdx) => {
              ctx.fillStyle = ALTERATION_COLORS[altType] || ALTERATION_COLORS.default;
              ctx.fillRect(viewportX, y + altIdx * segmentHeight, cellWidth, segmentHeight);
              ctx.strokeStyle = "#fff";
              ctx.lineWidth = 0.5;
              ctx.strokeRect(viewportX, y + altIdx * segmentHeight, cellWidth, segmentHeight);
            });
          }
        }
      }
    });

    if (cellWidth >= 8) {
      ctx.font = "9px Arial";
      ctx.fillStyle = "#666";
      for (let pairIdx = startCol; pairIdx < endCol; pairIdx++) {
        const pair = pairs[pairIdx];
        const contentX = MARGINS.left + pairIdx * (cellWidth + CELL_GAP) + cellWidth / 2;
        const viewportX = contentX - scrollLeft;
        const textY = MARGINS.top + genes.length * (cellHeight + CELL_GAP) + 5;

        ctx.save();
        ctx.translate(viewportX, textY);
        ctx.rotate(Math.PI / 4);
        ctx.fillText(pair, 0, 0);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  renderOncoPrint() {
    if (!this.labelsLayer || !this.heatmapShape) {
      return;
    }

    const { width } = this.props;
    const { genes, pairs, matrix, isNumeric } = this.computeOncoPrintData();

    this.labelsLayer.destroyChildren();

    if (genes.length === 0 || pairs.length === 0) {
      this.layoutParams = null;
      const noDataMessage = isNumeric
        ? "No data to display. The selected attribute has no non-zero values."
        : "No data to display. Select a gene set with driver genes.";
      const text = new Konva.Text({
        x: width / 2 - 150,
        y: 100,
        text: noDataMessage,
        fontSize: 14,
        fill: "#999",
      });
      this.labelsLayer.add(text);
      this.labelsLayer.batchDraw();
      return;
    }

    const { contentHeight, cellWidth, cellHeight } = this.getContentDimensions();

    if (this.stage) {
      this.stage.height(contentHeight);
    }

    let colorScale = null;
    let maxValue = 0;
    if (isNumeric) {
      matrix.forEach((val) => {
        if (typeof val === 'number' && val > maxValue) {
          maxValue = val;
        }
      });
      colorScale = (val) => {
        if (typeof val !== 'number' || val === 0) return "#f0f0f0";
        const intensity = Math.min(1, val / (maxValue || 1));
        const r = Math.round(240 - intensity * 188);
        const g = Math.round(240 - intensity * 128);
        const b = Math.round(240 + intensity * 15);
        return `rgb(${r}, ${g}, ${b})`;
      };
    }

    this.layoutParams = {
      cellWidth,
      cellHeight,
      genes,
      pairs,
      matrix,
      isNumeric,
      colorScale,
    };

    const labelBg = new Konva.Rect({
      x: 0,
      y: 0,
      width: MARGINS.left,
      height: contentHeight,
      fill: "#fff",
    });
    this.labelsLayer.add(labelBg);

    const frequencies = this.computeGeneFrequencies(isNumeric, genes);

    genes.forEach((gene, geneIdx) => {
      const freqValue = frequencies.get(gene);
      let labelText;
      if (freqValue !== undefined) {
        labelText = `${gene} (${freqValue.toFixed(1)}%)`;
      } else {
        labelText = gene;
      }

      const text = new Konva.Text({
        x: 5,
        y: MARGINS.top + geneIdx * (cellHeight + CELL_GAP) + cellHeight / 2 - 6,
        text: labelText,
        fontSize: 11,
        fill: "#333",
        width: MARGINS.left - 10,
        align: "right",
      });
      this.labelsLayer.add(text);
    });

    this.labelsLayer.batchDraw();

    this.currentScrollLeft = this.scrollContainerRef ? this.scrollContainerRef.scrollLeft : 0;
    this.heatmapLayer.batchDraw();
  }

  render() {
    const { width, height } = this.props;
    const { loading } = this.state;

    const { contentWidth, contentHeight } = this.getContentDimensions();
    const stageHeight = Math.max(height, contentHeight);

    return (
      <div style={{ position: "relative", width, height, overflow: "hidden" }}>
        <div
          ref={(ref) => (this.scrollContainerRef = ref)}
          onScroll={this.handleScroll}
          style={{
            width,
            height,
            overflowX: "scroll",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              width: contentWidth,
              height: stageHeight,
              position: "relative",
            }}
          >
            <div
              ref={(ref) => (this.containerRef = ref)}
              style={{
                position: "sticky",
                left: 0,
                width,
                height: stageHeight,
              }}
            />
          </div>
        </div>
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
  mode: PropTypes.oneOf(['categorical', 'numeric']),
  objectAttribute: PropTypes.string,
  onPairClick: PropTypes.func,
  enableMemoSort: PropTypes.bool,
};

OncoPrintPlot.defaultProps = {
  mode: 'categorical',
  objectAttribute: null,
  onPairClick: null,
  enableMemoSort: true,
};

export default OncoPrintPlot;
