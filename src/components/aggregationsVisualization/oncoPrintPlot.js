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

class OncoPrintPlot extends Component {
  containerRef = null;
  stage = null;
  layer = null;
  tooltipGroup = null;
  highlightRect = null;

  // Layout params for coordinate-based hit detection
  layoutParams = null;

  // Pending render timeout for cleanup
  pendingRenderTimeout = null;

  // Cache for parsed driver genes (keyed by record)
  parsedGenesCache = new WeakMap();

  // Memoization for computeOncoPrintData
  cachedOncoPrintData = null;
  cachedFilteredRecords = null;
  cachedGeneSet = null;
  cachedEnableMemoSort = null;

  // Memoization for computeGeneFrequencies
  cachedGeneFrequencies = null;
  cachedFrequenciesRecords = null;
  cachedFrequenciesGeneSet = null;

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

  isSignatureValue = (value) => {
    if (!value || typeof value !== 'string') return false;
    // Check if the value looks like a signature name (SBS1, ID3, etc.)
    return /^(SBS|ID)\d+[a-z]?$/i.test(value);
  };

  getSignatureDescription = (signatureName) => {
    if (!signatureName) return null;
    const sig = signatureMetadata.metadata[signatureName];
    return sig?.full || null;
  };

  getCellFromPosition(mouseX, mouseY) {
    if (!this.layoutParams) return null;

    const { margins, cellWidth, cellHeight, cellGap, genes, pairs, matrix, isNumeric } = this.layoutParams;

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

    if (isNumeric) {
      const key = `${gene},${pair}`;
      const value = matrix.get(key);
      return {
        gene,
        pair,
        value,
        isNumeric: true,
        geneIdx,
        pairIdx,
      };
    } else {
      const key = `${gene.toUpperCase()},${pair}`;
      const alterations = matrix.get(key) || [];
      return {
        gene,
        pair,
        alterations,
        isNumeric: false,
        geneIdx,
        pairIdx,
      };
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
    const { margins, cellWidth, cellHeight, cellGap } = this.layoutParams;

    // Position highlight rect
    const cellX = margins.left + pairIdx * (cellWidth + cellGap);
    const cellY = margins.top + geneIdx * (cellHeight + cellGap);
    this.highlightRect.position({ x: cellX, y: cellY });
    this.highlightRect.size({ width: cellWidth, height: cellHeight });
    this.highlightRect.visible(true);

    let textContent;
    if (isNumeric) {
      const { value } = cellData;
      const valueText = value !== undefined && value !== null ? value.toFixed(3) : "No value";
      textContent = `${pair}\n${gene}\n${valueText}`;
      
      // Add aetiology if gene or pair is a signature
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
      
      // Add aetiology if gene or pair is a signature
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

    // Numeric mode: use objectAttribute keys as rows
    if (mode === 'numeric' && objectAttribute) {
      return this.computeNumericOncoPrintData();
    }

    // Categorical mode: use geneSet (driver genes)
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

    // Filter out pairs that have no alterations across any gene
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

    // Discover all keys from the object attribute across all records
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

    const keys = Array.from(allKeys).sort();
    const pairs = filteredRecords.map((r) => r.pair).filter(Boolean);
    const matrix = new Map();

    // Build matrix with numeric values
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

    // Filter out pairs that have no non-zero values
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
    // Sort keys by frequency (count of non-zero values) across all pairs
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

    // Sort pairs by binary presence (higher weight for top keys)
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

    // Numeric mode: compute frequency (percentage where value > 0) for each key
    if (isNumeric && objectAttribute) {
      return this.computeNumericKeyFrequencies(keys);
    }

    // Categorical mode: compute percentages for genes
    if (!geneSet || geneSet.length === 0 || filteredRecords.length === 0) {
      return new Map();
    }

    // Check cache
    if (
      this.cachedGeneFrequencies &&
      this.cachedFrequenciesRecords === filteredRecords &&
      this.cachedFrequenciesGeneSet === geneSet
    ) {
      return this.cachedGeneFrequencies;
    }

    const totalRecords = filteredRecords.length;
    const geneFrequencies = new Map();

    // Initialize all genes with 0 count
    geneSet.forEach((gene) => {
      geneFrequencies.set(gene, 0);
    });

    // Count records containing each gene
    filteredRecords.forEach((record) => {
      const parsedGenes = this.getParsedGenes(record);
      const genesInRecord = new Set(parsedGenes.map((g) => g.gene));

      geneSet.forEach((gene) => {
        if (genesInRecord.has(gene.toUpperCase())) {
          geneFrequencies.set(gene, geneFrequencies.get(gene) + 1);
        }
      });
    });

    // Convert counts to percentages
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

  renderOncoPrint() {
    if (!this.layer) {
      return;
    }

    const { width, height } = this.props;
    const { genes, pairs, matrix, isNumeric } = this.computeOncoPrintData();

    this.layer.destroyChildren();

    if (genes.length === 0 || pairs.length === 0) {
      this.layoutParams = null;
      const noDataMessage = isNumeric
        ? "No data to display. The selected attribute has no non-zero values."
        : "No data to display. Select a gene set with driver genes.";
      const text = new Konva.Text({
        x: width / 2 - 150,
        y: height / 2 - 10,
        text: noDataMessage,
        fontSize: 14,
        fill: "#999",
      });
      this.layer.add(text);
      this.layer.batchDraw();
      return;
    }

    const margins = { top: 30, right: 20, bottom: 60, left: 150 };
    const innerWidth = width - margins.left - margins.right;
    const innerHeight = height - margins.top - margins.bottom;

    const cellWidth = Math.max(2, Math.min(20, innerWidth / pairs.length));
    const cellHeight = Math.max(12, Math.min(30, innerHeight / genes.length));
    const cellGap = 1;

    this.layoutParams = {
      margins,
      cellWidth,
      cellHeight,
      cellGap,
      genes,
      pairs,
      matrix,
      isNumeric,
    };

    // For numeric mode, compute color scale based on matrix values
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
        y: margins.top + geneIdx * (cellHeight + cellGap) + cellHeight / 2 - 6,
        text: labelText,
        fontSize: 11,
        fill: "#333",
        width: margins.left - 10,
        align: "right",
      });
      this.layer.add(text);
    });

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

    genes.forEach((gene, geneIdx) => {
      pairs.forEach((pair, pairIdx) => {
        const key = isNumeric ? `${gene},${pair}` : `${gene.toUpperCase()},${pair}`;
        const x = margins.left + pairIdx * (cellWidth + cellGap);
        const y = margins.top + geneIdx * (cellHeight + cellGap);

        if (isNumeric) {
          const val = matrix.get(key);
          const fill = colorScale(val);
          const rect = new Konva.Rect({
            x,
            y,
            width: cellWidth,
            height: cellHeight,
            fill,
            stroke: "#e0e0e0",
            strokeWidth: 0.5,
          });
          rect.setAttr("cellData", { gene, pair, value: val, isNumeric: true });
          this.layer.add(rect);
        } else {
          const alterations = matrix.get(key) || [];
          if (alterations.length === 0) {
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
