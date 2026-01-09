import React, { Component } from "react";
import PropTypes from "prop-types";
import Konva from "konva";
import {
  ERROR_BAR_CAP_WIDTH,
  ZOOM_SCALE_BY,
  ZOOM_DEBOUNCE_MS,
  ZOOM_PRECISION,
  HOVER_CLEAR_DELAY_MS,
  CONNECTING_LINE_STROKE,
  CONNECTING_LINE_WIDTH,
  CONNECTING_LINE_DASH,
  DEFAULT_RADIUS,
  DEFAULT_COLOR,
  DEFAULT_HIGHLIGHT_STROKE,
  DEFAULT_HIGHLIGHT_STROKE_WIDTH,
} from './constants';
import {
  normalizeAccessor,
  normalizeNumericAccessor,
  scalesChanged,
  createScales,
  saveStrokeState,
  restoreStrokeState,
} from './helpers';
import {
  createShape,
  createErrorBarGroup,
  createConnectingLine,
} from './shapeFactory';
import {
  createTooltipElements,
  calculateTooltipPosition,
  updateTooltipContent,
  formatTooltipContent,
} from './tooltipManager';
import {
  clampDomain,
  calculatePannedDomain,
} from './zoomPanUtils';
import {
  setLayerDimming,
  clearHoverLayerShapes,
  createHoverShapes,
  createHoverErrorBars,
  updateConnectingLine,
} from './hoverManager';

class KonvaScatter extends Component {
  // ============================================
  // DOM & Konva References
  // ============================================
  containerRef = null;
  stage = null;

  // ============================================
  // Konva Layers
  // ============================================
  errorBarsLayer = null;
  circlesLayer = null;
  hoverLayer = null;
  tooltipLayer = null;

  // ============================================
  // Tooltip Elements
  // ============================================
  tooltipGroup = null;
  tooltipRect = null;
  tooltipText = null;

  // ============================================
  // Hover State
  // ============================================
  hoveredNode = null;
  hoveredGroupId = null;
  activeHoverGroupId = null;
  hoverClearTimeout = null;
  cachedHoverLine = null;
  shapesByGroup = null;      // Map<groupId, shape[]>
  errorBarsByGroup = null;   // Map<groupId, errorBarGroup[]>

  // ============================================
  // Pan State
  // ============================================
  isPanning = false;
  lastPanPos = null;

  // ============================================
  // Zoom/Pan State (shared between zoom and pan)
  // ============================================
  positionUpdateRafId = null;
  localDomain = null;
  domainSyncTimeout = null;

  // ============================================
  // Data Cache (for fast position updates)
  // ============================================
  currentData = null;
  dataAccessors = null;

  componentDidMount() {
    this.initializeStage();
    this.renderPoints();
  }

  shouldComponentUpdate(nextProps) {
    // Tooltip is now handled entirely in Konva - no React state for it
    // Only re-render for meaningful prop changes
    const { width, height, data, selectedId, selectedIds, colorAccessor, colorScale, colorKey, xAccessor, yAccessor } = this.props;
    if (width !== nextProps.width || height !== nextProps.height) return true;
    if (data !== nextProps.data) return true;
    if (selectedId !== nextProps.selectedId) return true;
    if (selectedIds !== nextProps.selectedIds) return true;
    if (colorAccessor !== nextProps.colorAccessor) return true;
    if (colorScale !== nextProps.colorScale) return true;
    if (colorKey !== nextProps.colorKey) return true;
    if (xAccessor !== nextProps.xAccessor) return true;
    if (yAccessor !== nextProps.yAccessor) return true;
    if (scalesChanged(this.props.xScale, nextProps.xScale)) return true;
    if (scalesChanged(this.props.yScale, nextProps.yScale)) return true;
    return false;
  }

  componentDidUpdate(prevProps) {
    const { width, height, data, xScale, yScale, selectedId, selectedIds, colorAccessor, colorScale, xAccessor, yAccessor } = this.props;

    const hasScalesChanged = scalesChanged(prevProps.xScale, xScale) ||
                             scalesChanged(prevProps.yScale, yScale);

    if (width !== prevProps.width || height !== prevProps.height) {
      this.handleResize();
      return;
    }

    // Check if only scales changed (zoom/pan) - use fast position update
    const { colorKey } = this.props;
    const onlyScalesChanged = hasScalesChanged &&
      data === prevProps.data &&
      selectedId === prevProps.selectedId &&
      selectedIds === prevProps.selectedIds &&
      colorAccessor === prevProps.colorAccessor &&
      colorScale === prevProps.colorScale &&
      colorKey === prevProps.colorKey &&
      xAccessor === prevProps.xAccessor &&
      yAccessor === prevProps.yAccessor;

    if (onlyScalesChanged && this.currentData) {
      // Fast path: just update positions without recreating shapes
      this.updatePositions();
      return;
    }

    if (
      data !== prevProps.data ||
      hasScalesChanged ||
      selectedId !== prevProps.selectedId ||
      selectedIds !== prevProps.selectedIds ||
      colorAccessor !== prevProps.colorAccessor ||
      colorScale !== prevProps.colorScale ||
      colorKey !== prevProps.colorKey ||
      xAccessor !== prevProps.xAccessor ||
      yAccessor !== prevProps.yAccessor
    ) {
      this.renderPoints();
    }
  }

  componentWillUnmount() {
    if (this.positionUpdateRafId) {
      cancelAnimationFrame(this.positionUpdateRafId);
    }
    if (this.domainSyncTimeout) {
      clearTimeout(this.domainSyncTimeout);
    }
    if (this.hoverClearTimeout) {
      clearTimeout(this.hoverClearTimeout);
    }
    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
    }
  }

  initializeStage() {
    const { width, height, clipBounds } = this.props;

    if (!this.containerRef || width <= 0 || height <= 0) return;

    this.stage = new Konva.Stage({
      container: this.containerRef,
      width,
      height,
    });

    // Use clipBounds if provided, otherwise full canvas
    const clip = clipBounds || { x: 0, y: 0, width, height };

    this.errorBarsLayer = new Konva.Layer({ listening: false, clip });
    this.stage.add(this.errorBarsLayer);

    this.circlesLayer = new Konva.Layer({ clip });
    this.stage.add(this.circlesLayer);

    this.hoverLayer = new Konva.Layer({ listening: true, clip });
    this.stage.add(this.hoverLayer);

    this.tooltipLayer = new Konva.Layer({ listening: false });
    this.stage.add(this.tooltipLayer);
    this.initializeTooltip();

    this.stage.on("mouseover", this.handleStageMouseOver);
    this.stage.on("mouseout", this.handleStageMouseOut);
    this.stage.on("mousemove", this.handleStageMouseMove);
    this.stage.on("mouseleave", this.handleStageMouseLeave);
    this.stage.on("click", this.handleStageClick);

    // Add zoom/pan handlers
    this.stage.on("wheel", this.handleWheel);
    this.stage.on("mousedown", this.handlePanStart);
    this.stage.on("touchstart", this.handlePanStart);
  }

  initializeTooltip() {
    const elements = createTooltipElements(this.tooltipLayer);
    this.tooltipGroup = elements.tooltipGroup;
    this.tooltipRect = elements.tooltipRect;
    this.tooltipText = elements.tooltipText;
  }

  handleResize() {
    const { width, height, clipBounds } = this.props;

    if (!this.stage) {
      this.initializeStage();
      this.renderPoints();
      return;
    }

    this.stage.size({ width, height });
    const clip = clipBounds || { x: 0, y: 0, width, height };
    if (this.circlesLayer) {
      this.circlesLayer.clip(clip);
    }
    if (this.errorBarsLayer) {
      this.errorBarsLayer.clip(clip);
    }
    if (this.hoverLayer) {
      this.hoverLayer.clip(clip);
    }
    this.renderPoints();
  }

  handleStageMouseOver = (evt) => {
    const { disableTooltip, onPointHover, tooltipAccessor, width, hoverStroke, hoverStrokeWidth, fadeOnHover } = this.props;
    const node = evt.target;

    if (node === this.stage || !node.getAttr) return;

    const dataPoint = node.getAttr("dataPoint");
    if (!dataPoint) return;

    this.hoveredNode = node;
    this.stage.container().style.cursor = "pointer";

    // Use cached accessor instead of creating new one (Phase 3)
    const groupId = this.dataAccessors?.getGroupId ? this.dataAccessors.getGroupId(dataPoint) : null;
    this.hoveredGroupId = groupId;

    if (fadeOnHover && groupId) {
      // Let applyHoverEffect handle all visual changes including stroke
      this.applyHoverEffect(groupId);
      // applyHoverEffect does its own batchDraw, skip the one below
    } else {
      // No fade effect - just highlight this node
      saveStrokeState(node);
      node.stroke(hoverStroke);
      node.strokeWidth(hoverStrokeWidth);
      this.circlesLayer.batchDraw();
    }

    if (onPointHover) {
      onPointHover(dataPoint);
    }

    if (!disableTooltip && this.tooltipGroup) {
      const mousePos = this.stage.getPointerPosition();
      const content = formatTooltipContent(dataPoint, tooltipAccessor);

      updateTooltipContent({
        tooltipText: this.tooltipText,
        tooltipRect: this.tooltipRect,
        content,
      });

      this.updateTooltipPosition(mousePos, width);
      this.tooltipGroup.visible(true);
      this.tooltipLayer.batchDraw();
    }
  };

  /**
   * Apply hover effect to a group of related points.
   * Uses CSS opacity trick for O(1) dimming instead of per-shape opacity.
   * @param {string} groupId - The group identifier to highlight
   */
  applyHoverEffect = (groupId) => {
    // Cancel any pending hover clear (prevents flicker when moving between layers)
    if (this.hoverClearTimeout) {
      clearTimeout(this.hoverClearTimeout);
      this.hoverClearTimeout = null;
    }

    // Skip if already hovering this group (key optimization from Chart.js)
    if (groupId === this.activeHoverGroupId) return;

    const { xScale, yScale, colorScale, hoverStroke, hoverStrokeWidth, radiusAccessor, shapeAccessor, hollowAccessor } = this.props;

    if (!this.shapesByGroup || !this.dataAccessors) return;

    const { getX, getY, getColor, getCiLower, getCiUpper } = this.dataAccessors;
    const getRadius = typeof radiusAccessor === 'function' ? radiusAccessor : () => radiusAccessor || DEFAULT_RADIUS;
    const getShape = shapeAccessor ? normalizeAccessor(shapeAccessor) : () => "circle";
    const getHollow = hollowAccessor ? normalizeAccessor(hollowAccessor) : () => false;

    // Clear previous hover shapes and apply dimming
    clearHoverLayerShapes(this.hoverLayer, this.cachedHoverLine);
    setLayerDimming(this.circlesLayer, this.errorBarsLayer, true);

    // O(1) lookup for hovered group shapes
    const hoveredShapes = this.shapesByGroup.get(groupId) || [];
    const hoveredErrorBars = this.errorBarsByGroup?.get(groupId) || [];

    // Create new shapes in hoverLayer for hovered group
    const sameGroupPoints = createHoverShapes({
      hoveredShapes,
      hoverLayer: this.hoverLayer,
      xScale,
      yScale,
      colorScale,
      getX,
      getY,
      getColor,
      getRadius,
      getShape,
      getHollow,
      hoverStroke,
      hoverStrokeWidth,
    });

    // Create error bars in hoverLayer for hovered group
    createHoverErrorBars({
      hoveredErrorBars,
      hoverLayer: this.hoverLayer,
      xScale,
      yScale,
      colorScale,
      getX,
      getY,
      getColor,
      getCiLower,
      getCiUpper,
    });

    this.activeHoverGroupId = groupId;

    // Ensure connecting line exists
    if (!this.cachedHoverLine) {
      this.cachedHoverLine = createConnectingLine({
        stroke: CONNECTING_LINE_STROKE,
        strokeWidth: CONNECTING_LINE_WIDTH,
        dash: CONNECTING_LINE_DASH,
      });
      this.hoverLayer.add(this.cachedHoverLine);
    }

    // Update connecting line between same-group points
    updateConnectingLine(this.cachedHoverLine, sameGroupPoints);

    // Only need to draw hoverLayer - CSS opacity handles the dimming
    this.hoverLayer.batchDraw();
  };

  clearHoverEffect = () => {
    // Restore CSS opacity and clear hover shapes
    setLayerDimming(this.circlesLayer, this.errorBarsLayer, false);
    clearHoverLayerShapes(this.hoverLayer, this.cachedHoverLine);

    this.activeHoverGroupId = null;

    // Hide connecting line
    if (this.cachedHoverLine) {
      this.cachedHoverLine.visible(false);
    }

    // Only need to draw hoverLayer
    this.hoverLayer.batchDraw();
  };

  handleStageMouseMove = (evt) => {
    const { disableTooltip, width } = this.props;
    
    if (!disableTooltip && this.tooltipGroup && this.tooltipGroup.visible()) {
      const mousePos = this.stage.getPointerPosition();
      this.updateTooltipPosition(mousePos, width);
      this.tooltipLayer.batchDraw();
    }
  };

  handleStageMouseOut = (evt) => {
    const { fadeOnHover } = this.props;
    const node = evt.target;
    if (node === this.stage) return;

    if (this.stage) {
      this.stage.container().style.cursor = "default";
    }

    if (this.hoveredNode) {
      // Only restore stroke if we're not using fadeOnHover
      // (fadeOnHover uses hoverLayer and doesn't modify original shapes)
      if (!fadeOnHover) {
        restoreStrokeState(this.hoveredNode);
      }
      this.hoveredNode = null;
    }

    if (fadeOnHover && this.hoveredGroupId) {
      // Use delayed clear to prevent flicker when moving from circlesLayer to hoverLayer
      // The timeout will be cancelled if we mouseover a shape in the same group
      if (this.hoverClearTimeout) {
        clearTimeout(this.hoverClearTimeout);
      }
      this.hoverClearTimeout = setTimeout(() => {
        this.hoverClearTimeout = null;
        this.clearHoverEffect();
        this.hoveredGroupId = null;
      }, HOVER_CLEAR_DELAY_MS);
    } else {
      this.circlesLayer.batchDraw();
    }

    if (this.tooltipGroup) {
      this.tooltipGroup.visible(false);
      this.tooltipLayer.batchDraw();
    }
  };

  updateTooltipPosition(mousePos, width) {
    const { height } = this.props;
    const position = calculateTooltipPosition({
      mousePos,
      tooltipWidth: this.tooltipRect.width(),
      tooltipHeight: this.tooltipRect.height(),
      canvasWidth: width,
      canvasHeight: height,
    });
    this.tooltipGroup.position(position);
  }

  handleStageMouseLeave = () => {
    const { onPointHoverEnd, fadeOnHover } = this.props;

    // Cancel any pending hover clear since we're leaving the stage entirely
    if (this.hoverClearTimeout) {
      clearTimeout(this.hoverClearTimeout);
      this.hoverClearTimeout = null;
    }

    if (onPointHoverEnd) {
      onPointHoverEnd();
    }

    if (this.stage) {
      this.stage.container().style.cursor = "default";
    }

    if (this.hoveredNode) {
      // Only restore stroke if we're not using fadeOnHover
      // (fadeOnHover uses hoverLayer and doesn't modify original shapes)
      if (!fadeOnHover) {
        restoreStrokeState(this.hoveredNode);
      }
      this.hoveredNode = null;
    }

    if (fadeOnHover && this.hoveredGroupId) {
      this.clearHoverEffect();
      this.hoveredGroupId = null;
    } else {
      this.circlesLayer.batchDraw();
    }

    if (this.tooltipGroup) {
      this.tooltipGroup.visible(false);
      this.tooltipLayer.batchDraw();
    }
  };

  handleStageClick = (evt) => {
    const { onPointClick } = this.props;
    const node = evt.target;

    if (node === this.stage || !node.getAttr) return;

    const dataPoint = node.getAttr("dataPoint");
    if (dataPoint && onPointClick) {
      onPointClick(dataPoint);
    }
  };

  handleWheel = (evt) => {
    const { enableZoom, onZoomChange, clipBounds, xScale, yScale, zoomLimits, minZoomRange } = this.props;
    if (!enableZoom || !onZoomChange || !xScale) return;

    // Prevent page scroll
    evt.evt.preventDefault();
    evt.evt.stopPropagation();

    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;

    // Clear hover effect during zoom to avoid stale hover shapes
    if (this.activeHoverGroupId !== null) {
      this.clearHoverEffect();
      this.hoveredGroupId = null;
      // Also hide tooltip
      if (this.tooltipGroup) {
        this.tooltipGroup.visible(false);
        this.tooltipLayer.batchDraw();
      }
    }

    // Get zoom limits
    const [limitMin, limitMax] = zoomLimits || xScale.domain();
    const maxRange = limitMax - limitMin;
    const minRange = minZoomRange || maxRange / 100;

    // Get current domain - use local zoom if active, otherwise props
    const domain = this.localDomain || xScale.domain();
    const range = xScale.range();
    const currentMin = domain[0];
    const currentMax = domain[1];
    const currentRange = currentMax - currentMin;

    // Calculate zoom direction
    const scaleBy = ZOOM_SCALE_BY;
    const direction = evt.evt.deltaY > 0 ? 1 : -1; // 1 = zoom out, -1 = zoom in

    // Early exit if already at limits
    const isAtMaxZoom = currentRange >= maxRange - ZOOM_PRECISION; // Already fully zoomed out
    const isAtMinZoom = currentRange <= minRange + ZOOM_PRECISION; // Already fully zoomed in

    if (isAtMaxZoom && direction > 0) {
      // Already at max zoom out, can't zoom out further
      return;
    }
    if (isAtMinZoom && direction < 0) {
      // Already at max zoom in, can't zoom in further
      return;
    }

    const factor = direction > 0 ? scaleBy : 1 / scaleBy;

    // Get mouse position in data coordinates
    const plotLeft = clipBounds ? clipBounds.x : range[0];
    const plotRight = clipBounds ? clipBounds.x + clipBounds.width : range[1];
    const mouseRatio = Math.max(0, Math.min(1, (pointer.x - plotLeft) / (plotRight - plotLeft)));
    const mouseDataX = currentMin + mouseRatio * currentRange;

    // Calculate new range
    let newRange = currentRange * factor;

    // Clamp range to limits
    if (newRange >= maxRange) {
      // Zooming out to or beyond max - reset to full view
      this.localDomain = null;
      if (this.domainSyncTimeout) {
        clearTimeout(this.domainSyncTimeout);
      }
      onZoomChange({ xMin: limitMin, xMax: limitMax });
      return;
    }
    if (newRange < minRange) {
      // Can't zoom in further
      return;
    }

    // Zoom towards mouse position
    let newMin = mouseDataX - mouseRatio * newRange;
    let newMax = mouseDataX + (1 - mouseRatio) * newRange;

    // Clamp to data bounds
    [newMin, newMax] = clampDomain(newMin, newMax, limitMin, limitMax);

    // Store local zoom domain
    this.localDomain = [newMin, newMax];

    // Immediately update positions locally (no React!) - using RAF for smooth animation
    if (!this.positionUpdateRafId) {
      this.positionUpdateRafId = requestAnimationFrame(() => {
        this.positionUpdateRafId = null;
        if (this.localDomain && this.currentData && this.dataAccessors) {
          // Create temporary scale with local domain
          const tempXScale = xScale.copy().domain(this.localDomain);
          this.updatePositionsWithScale(tempXScale, yScale);
        }
      });
    }

    // Debounce React sync - only fire after no wheel events for the debounce period
    if (this.domainSyncTimeout) {
      clearTimeout(this.domainSyncTimeout);
    }
    this.domainSyncTimeout = setTimeout(() => {
      if (this.localDomain) {
        onZoomChange({ xMin: this.localDomain[0], xMax: this.localDomain[1] });
        this.localDomain = null;
      }
    }, ZOOM_DEBOUNCE_MS);
  };

  handlePanStart = (evt) => {
    const { enablePan, onZoomChange, xScale, clipBounds } = this.props;
    if (!enablePan || !onZoomChange || !xScale) return;

    // Don't start pan if clicking on a data point
    const node = evt.target;
    if (node !== this.stage && node.getAttr && node.getAttr("dataPoint")) return;

    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;

    // Check if pointer is within plot area
    if (clipBounds) {
      if (pointer.x < clipBounds.x || pointer.x > clipBounds.x + clipBounds.width ||
          pointer.y < clipBounds.y || pointer.y > clipBounds.y + clipBounds.height) {
        return;
      }
    }

    // Clear hover effect during pan to avoid stale hover shapes
    if (this.activeHoverGroupId !== null) {
      this.clearHoverEffect();
      this.hoveredGroupId = null;
      // Also hide tooltip
      if (this.tooltipGroup) {
        this.tooltipGroup.visible(false);
        this.tooltipLayer.batchDraw();
      }
    }

    this.isPanning = true;
    this.lastPanPos = pointer;
    this.stage.container().style.cursor = "grabbing";

    // Add global listeners for pan
    window.addEventListener("mousemove", this.handlePanMove);
    window.addEventListener("mouseup", this.handlePanEnd);
    window.addEventListener("touchmove", this.handlePanMove);
    window.addEventListener("touchend", this.handlePanEnd);
  };

  handlePanMove = (evt) => {
    if (!this.isPanning || !this.lastPanPos) return;

    const { onZoomChange, xScale, yScale, clipBounds, zoomLimits } = this.props;
    if (!onZoomChange || !xScale) return;

    evt.preventDefault();

    // Get zoom limits
    const [limitMin, limitMax] = zoomLimits || xScale.domain();

    // Get current mouse position
    const rect = this.containerRef.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const pointerX = clientX - rect.left;

    // Calculate delta in pixels
    const deltaX = pointerX - this.lastPanPos.x;
    this.lastPanPos = { x: pointerX, y: this.lastPanPos.y };

    // Convert to data units - use local domain if active
    const domain = this.localDomain || xScale.domain();
    const plotWidth = clipBounds ? clipBounds.width : (xScale.range()[1] - xScale.range()[0]);

    // Calculate new domain (pan is inverted - drag right = move left in data)
    const [newMin, newMax] = calculatePannedDomain(domain, deltaX, plotWidth, [limitMin, limitMax]);

    // Store local domain and update immediately
    this.localDomain = [newMin, newMax];

    // Immediate local update (no React)
    if (this.currentData && this.dataAccessors) {
      const tempXScale = xScale.copy().domain(this.localDomain);
      this.updatePositionsWithScale(tempXScale, yScale);
    }

    // Debounce React sync
    if (this.domainSyncTimeout) {
      clearTimeout(this.domainSyncTimeout);
    }
    this.domainSyncTimeout = setTimeout(() => {
      if (this.localDomain) {
        onZoomChange({ xMin: this.localDomain[0], xMax: this.localDomain[1] });
        this.localDomain = null;
      }
    }, ZOOM_DEBOUNCE_MS);
  };

  handlePanEnd = () => {
    this.isPanning = false;
    this.lastPanPos = null;
    if (this.stage) {
      this.stage.container().style.cursor = "default";
    }

    // Immediately sync to React when pan ends
    if (this.domainSyncTimeout) {
      clearTimeout(this.domainSyncTimeout);
      this.domainSyncTimeout = null;
    }
    if (this.localDomain) {
      const { onZoomChange } = this.props;
      if (onZoomChange) {
        onZoomChange({ xMin: this.localDomain[0], xMax: this.localDomain[1] });
      }
      this.localDomain = null;
    }

    window.removeEventListener("mousemove", this.handlePanMove);
    window.removeEventListener("mouseup", this.handlePanEnd);
    window.removeEventListener("touchmove", this.handlePanMove);
    window.removeEventListener("touchend", this.handlePanEnd);
  };

  getScales() {
    const { width, height, data, xAccessor, yAccessor, xScale, yScale } = this.props;
    return createScales({ width, height, data, xAccessor, yAccessor, xScale, yScale });
  }

  /**
   * Render all data points to the canvas.
   * Creates Konva shapes for each point and error bars if enabled.
   * Builds group membership maps for fast hover lookups.
   */
  renderPoints() {
    if (!this.circlesLayer) {
      return;
    }

    // Clear any hover state before re-rendering
    if (this.activeHoverGroupId !== null) {
      this.clearHoverEffect();
    }

    const {
      data,
      colorAccessor,
      colorScale,
      radiusAccessor,
      shapeAccessor,
      idAccessor,
      selectedId,
      selectedIds,
      highlightStroke,
      highlightStrokeWidth,
      zOrderComparator,
      ciLowerAccessor,
      ciUpperAccessor,
      showErrorBars,
      hollowAccessor,
    } = this.props;

    this.circlesLayer.destroyChildren();
    if (this.errorBarsLayer) {
      this.errorBarsLayer.destroyChildren();
    }

    if (!data || data.length === 0) {
      this.circlesLayer.batchDraw();
      if (this.errorBarsLayer) this.errorBarsLayer.batchDraw();
      return;
    }

    const { xScale, yScale, getX, getY } = this.getScales();

    if (!xScale || !yScale) {
      this.circlesLayer.batchDraw();
      if (this.errorBarsLayer) this.errorBarsLayer.batchDraw();
      return;
    }

    const getColor = colorAccessor ? normalizeAccessor(colorAccessor) : () => DEFAULT_COLOR;
    const getRadius = normalizeNumericAccessor(radiusAccessor, DEFAULT_RADIUS);
    const getShape = shapeAccessor ? normalizeAccessor(shapeAccessor) : () => "circle";
    const getId = idAccessor ? normalizeAccessor(idAccessor) : (d, i) => i;
    const getCiLower = ciLowerAccessor ? normalizeAccessor(ciLowerAccessor) : null;
    const getCiUpper = ciUpperAccessor ? normalizeAccessor(ciUpperAccessor) : null;
    const getHollow = hollowAccessor ? normalizeAccessor(hollowAccessor) : () => false;

    const selectedIdsSet = new Set(
      selectedIds || (selectedId !== undefined && selectedId !== null ? [selectedId] : [])
    );

    let sortedData = data
      .map((d, i) => {
        const xVal = getX(d);
        const yVal = getY(d);
        if (xVal == null || yVal == null || isNaN(xVal) || isNaN(yVal)) {
          return null;
        }
        return { ...d, _originalIndex: i };
      })
      .filter(Boolean);

    if (zOrderComparator) {
      sortedData = sortedData.sort(zOrderComparator);
    }

    sortedData.forEach((d) => {
      const xVal = getX(d);
      const yVal = getY(d);
      const screenX = xScale(xVal);
      const screenY = yScale(yVal);

      if (isNaN(screenX) || isNaN(screenY)) return;

      const colorVal = getColor(d);
      const fill = colorScale ? colorScale(colorVal) : colorVal;
      const radius = getRadius(d);
      const shapeType = getShape(d);
      const pointId = getId(d, d._originalIndex);
      const isSelected = selectedIdsSet.has(pointId);
      const isHollow = getHollow(d);

      if (showErrorBars && this.errorBarsLayer) {
        const ciLower = getCiLower ? getCiLower(d) : null;
        const ciUpper = getCiUpper ? getCiUpper(d) : null;
        const yLower = ciLower != null && !isNaN(ciLower) ? yScale(ciLower) : null;
        const yUpper = ciUpper != null && !isNaN(ciUpper) ? yScale(ciUpper) : null;

        const errorBarGroup = createErrorBarGroup({
          screenX,
          screenY,
          yLower,
          yUpper,
          stroke: fill,
        });

        if (errorBarGroup) {
          errorBarGroup.setAttr("dataPoint", d);
          this.errorBarsLayer.add(errorBarGroup);
        }
      }

      const shape = createShape({
        shapeType,
        x: screenX,
        y: screenY,
        radius,
        fill,
        isHollow,
        stroke: isSelected ? highlightStroke : undefined,
        strokeWidth: isSelected ? highlightStrokeWidth : undefined,
      });

      shape.setAttr("dataPoint", d);
      shape.setAttr("pointId", pointId);

      this.circlesLayer.add(shape);
    });

    if (this.errorBarsLayer) {
      this.errorBarsLayer.batchDraw();
    }
    this.circlesLayer.batchDraw();

    // Cache data and accessors for fast position updates AND hover (Phases 1 & 2)
    const { groupAccessor } = this.props;
    this.currentData = sortedData;
    this.dataAccessors = {
      getX,
      getY,
      getCiLower,
      getCiUpper,
      getColor,
      getGroupId: groupAccessor ? normalizeAccessor(groupAccessor) : null,
    };

    // Pre-compute group memberships for fast hover (Phase 1)
    if (groupAccessor) {
      const getGroupId = this.dataAccessors.getGroupId;
      this.shapesByGroup = new Map();
      this.errorBarsByGroup = new Map();

      this.circlesLayer.children.forEach((shape) => {
        const dp = shape.getAttr("dataPoint");
        if (!dp) return;
        const gid = getGroupId(dp);
        if (!this.shapesByGroup.has(gid)) {
          this.shapesByGroup.set(gid, []);
        }
        this.shapesByGroup.get(gid).push(shape);
      });

      if (this.errorBarsLayer) {
        this.errorBarsLayer.children.forEach((errorGroup) => {
          const dp = errorGroup.getAttr("dataPoint");
          if (!dp) return;
          const gid = getGroupId(dp);
          if (!this.errorBarsByGroup.has(gid)) {
            this.errorBarsByGroup.set(gid, []);
          }
          this.errorBarsByGroup.get(gid).push(errorGroup);
        });
      }
    } else {
      this.shapesByGroup = null;
      this.errorBarsByGroup = null;
    }
  }

  // Fast position update without recreating shapes - used during zoom/pan
  updatePositions() {
    const { xScale, yScale } = this.props;
    this.updatePositionsWithScale(xScale, yScale);
  }

  /**
   * Fast position update without recreating shapes.
   * Used during zoom/pan for smooth 60fps interactions.
   * @param {Function} xScale - d3 scale for x axis
   * @param {Function} yScale - d3 scale for y axis
   */
  updatePositionsWithScale(xScale, yScale) {
    if (!this.circlesLayer || !this.currentData || !this.dataAccessors) {
      return;
    }

    const { showErrorBars } = this.props;
    const { getX, getY, getCiLower, getCiUpper } = this.dataAccessors;

    if (!xScale || !yScale) return;

    const circleShapes = this.circlesLayer.children;

    // Update circle/shape positions
    circleShapes.forEach((shape) => {
      const dataPoint = shape.getAttr("dataPoint");
      if (!dataPoint) return;

      const xVal = getX(dataPoint);
      const yVal = getY(dataPoint);
      const screenX = xScale(xVal);
      const screenY = yScale(yVal);

      if (isNaN(screenX) || isNaN(screenY)) return;

      // Update position based on shape type
      if (shape.className === "Rect") {
        const radius = shape.width() / 2;
        shape.x(screenX - radius);
        shape.y(screenY - radius);
      } else {
        shape.x(screenX);
        shape.y(screenY);
      }
    });

    // Update error bar positions
    if (showErrorBars && this.errorBarsLayer) {
      this.errorBarsLayer.children.forEach((errorGroup) => {
        const d = errorGroup.getAttr("dataPoint");
        if (!d) return;

        const xVal = getX(d);
        const yVal = getY(d);
        const screenX = xScale(xVal);
        const screenY = yScale(yVal);

        const ciLower = getCiLower ? getCiLower(d) : null;
        const ciUpper = getCiUpper ? getCiUpper(d) : null;
        const hasLower = ciLower != null && !isNaN(ciLower);
        const hasUpper = ciUpper != null && !isNaN(ciUpper);

        const yLower = hasLower ? yScale(ciLower) : null;
        const yUpper = hasUpper ? yScale(ciUpper) : null;

        const lines = errorGroup.children;
        let lineIdx = 0;

        // Update vertical line
        if (lines[lineIdx]) {
          if (hasLower && hasUpper) {
            lines[lineIdx].points([screenX, yLower, screenX, yUpper]);
          } else if (hasLower) {
            lines[lineIdx].points([screenX, screenY, screenX, yLower]);
          } else if (hasUpper) {
            lines[lineIdx].points([screenX, screenY, screenX, yUpper]);
          }
          lineIdx++;
        }

        // Update lower cap if present
        if (hasLower && lines[lineIdx]) {
          lines[lineIdx].points([screenX - ERROR_BAR_CAP_WIDTH, yLower, screenX + ERROR_BAR_CAP_WIDTH, yLower]);
          lineIdx++;
        }

        // Update upper cap if present
        if (hasUpper && lines[lineIdx]) {
          lines[lineIdx].points([screenX - ERROR_BAR_CAP_WIDTH, yUpper, screenX + ERROR_BAR_CAP_WIDTH, yUpper]);
        }
      });
    }

    // Update connecting line if hover is active
    if (this.activeHoverGroupId && this.cachedHoverLine && this.cachedHoverLine.visible()) {
      const hoveredShapes = this.shapesByGroup?.get(this.activeHoverGroupId) || [];
      if (hoveredShapes.length > 1) {
        const sameGroupPoints = hoveredShapes
          .map((shape) => {
            const dp = shape.getAttr("dataPoint");
            if (!dp) return null;
            return {
              x: xScale(getX(dp)),
              y: yScale(getY(dp)),
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.y - b.y);

        if (sameGroupPoints.length > 1) {
          this.cachedHoverLine.points(sameGroupPoints.flatMap((p) => [p.x, p.y]));
        }
      }
    }

    // Batch draw for performance
    if (this.errorBarsLayer) {
      this.errorBarsLayer.batchDraw();
    }
    this.circlesLayer.batchDraw();
    // Also redraw hoverLayer if hover is active
    if (this.activeHoverGroupId) {
      this.hoverLayer.batchDraw();
    }
  }

  render() {
    const { width, height } = this.props;

    return (
      <div style={{ position: "relative", width, height }}>
        <div
          ref={(ref) => (this.containerRef = ref)}
          style={{ width, height }}
        />
      </div>
    );
  }
}

KonvaScatter.propTypes = {
  data: PropTypes.array.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,

  xAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]).isRequired,
  yAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]).isRequired,
  xScale: PropTypes.func,
  yScale: PropTypes.func,

  colorAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  colorScale: PropTypes.func,
  radiusAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.number]),
  shapeAccessor: PropTypes.func,

  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectedIds: PropTypes.array,
  highlightStroke: PropTypes.string,
  highlightStrokeWidth: PropTypes.number,
  hoverStroke: PropTypes.string,
  hoverStrokeWidth: PropTypes.number,

  tooltipAccessor: PropTypes.func,
  idAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),

  onPointClick: PropTypes.func,
  onPointHover: PropTypes.func,
  onPointHoverEnd: PropTypes.func,

  zOrderComparator: PropTypes.func,

  disableTooltip: PropTypes.bool,

  ciLowerAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  ciUpperAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  showErrorBars: PropTypes.bool,

  groupAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  fadeOnHover: PropTypes.bool,

  // Hollow points (stroke-only circles)
  hollowAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),

  // Clipping bounds for plot area
  clipBounds: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
  }),

  // Zoom/pan support
  enableZoom: PropTypes.bool,
  enablePan: PropTypes.bool,
  onZoomChange: PropTypes.func,
  zoomLimits: PropTypes.arrayOf(PropTypes.number),
  minZoomRange: PropTypes.number,
};

KonvaScatter.defaultProps = {
  radiusAccessor: DEFAULT_RADIUS,
  highlightStroke: DEFAULT_HIGHLIGHT_STROKE,
  highlightStrokeWidth: DEFAULT_HIGHLIGHT_STROKE_WIDTH,
  hoverStroke: DEFAULT_HIGHLIGHT_STROKE,
  hoverStrokeWidth: DEFAULT_HIGHLIGHT_STROKE_WIDTH,
  disableTooltip: false,
  showErrorBars: false,
  fadeOnHover: false,
  enableZoom: false,
  enablePan: false,
};

export default KonvaScatter;
