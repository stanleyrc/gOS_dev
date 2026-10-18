import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  baseScale,
  defaultView3d,
  normalizeCloud,
  orbit,
  pickPoint,
  projectAll,
  projectPoint,
  rotationMatrix,
  zoom3d,
} from "../../helpers/singleCell/umap3d";
import { wheelFactor } from "../../helpers/singleCell/umapZoom";
import usePixelRatio from "./usePixelRatio";

const VERT = `
precision mediump float;
attribute vec3 position;
attribute vec3 color;
attribute float size;
attribute float flag;      // 0 filled, 1 hollow
uniform mat3 rot;
uniform vec2 half_px;      // plot half size in px
uniform vec2 pan;          // px
uniform float scale;       // px per normalised unit
uniform float ratio;
uniform float sizeMul;
varying vec3 vColor;
varying float vFlag;
void main() {
  vec3 r = rot * position;
  vec2 px = vec2(r.x, r.y) * scale + vec2(pan.x, -pan.y);
  gl_Position = vec4(px / half_px, -r.z * 0.45, 1.0);
  gl_PointSize = size * sizeMul * ratio;
  vColor = color;
  vFlag = flag;
}`;
const FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vFlag;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float edge = 1.0 - smoothstep(0.82, 1.0, d);
  float a = edge;
  if (vFlag > 0.5) a = edge * smoothstep(0.45, 0.62, d);
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor * a, a);
}`;

/**
 * WebGL (regl) point cloud with orbit controls. points: [{ x, y, z, rgb: [r,g,b] 0..1,
 * hollow, selected }]. Drag rotates, Shift/right-drag pans, wheel zooms, double-click
 * resets. onHover(index | -1, x, y) and onPick(index, event) report picking.
 */
export default function Umap3dCanvas({
  points,
  width,
  height,
  view,
  onViewChange,
  onHover,
  onPick,
  hoveredIndex = -1,
  baseSize = 7,
  ink = "#555",
  haloColor = [0.08, 0.08, 0.08],
  onResetRequest,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const reglRef = useRef(null);
  const gpuRef = useRef(null);
  const dragRef = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const ratio = usePixelRatio();
  const [glError, setGlError] = useState(null);

  const cloud = useMemo(() => normalizeCloud(points), [points]);
  const proj = useMemo(() => projectAll(view, cloud.xyz, width, height), [view, cloud, width, height]);

  /* ---- regl setup ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let regl;
    try {
      // eslint-disable-next-line global-require
      regl = require("regl")({ canvas, attributes: { antialias: true, depth: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true } });
    } catch (error) {
      setGlError(error.message || "WebGL is not available");
      return undefined;
    }
    reglRef.current = regl;
    const draw = regl({
      vert: VERT,
      frag: FRAG,
      attributes: {
        position: regl.prop("position"),
        color: regl.prop("color"),
        size: regl.prop("size"),
        flag: regl.prop("flag"),
      },
      uniforms: {
        rot: regl.prop("rot"),
        half_px: regl.prop("half_px"),
        pan: regl.prop("pan"),
        scale: regl.prop("scale"),
        ratio: regl.prop("ratio"),
        sizeMul: regl.prop("sizeMul"),
      },
      count: regl.prop("count"),
      primitive: "points",
      depth: { enable: true, func: "lequal" },
      blend: { enable: true, func: { srcRGB: "one", srcAlpha: "one", dstRGB: "one minus src alpha", dstAlpha: "one minus src alpha" } },
    });
    gpuRef.current = { regl, draw, buffers: null };
    return () => {
      try {
        regl.destroy();
      } catch (error) {
        // context already gone
      }
      reglRef.current = null;
      gpuRef.current = null;
    };
  }, []);

  /* ---- upload point data ---- */
  const data = useMemo(() => {
    const n = points.length;
    const color = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const flag = new Float32Array(n);
    const halo = [];
    points.forEach((p, i) => {
      color.set(p.rgb || [0.7, 0.7, 0.7], 3 * i);
      size[i] = (p.selected ? 1.35 : 1) * (p.sizeMul || 1) * baseSize;
      flag[i] = p.hollow ? 1 : 0;
      if (p.selected) halo.push(i);
    });
    return { color, size, flag, halo };
  }, [points, baseSize]);

  const renderRef = useRef(null);
  renderRef.current = () => {
    const gpu = gpuRef.current;
    if (!gpu) return;
    const { regl, draw } = gpu;
    const v = viewRef.current;
    const R = rotationMatrix(v.yaw, v.pitch);
    // regl takes mat3 column-major
    const rot = [R[0][0], R[1][0], R[2][0], R[0][1], R[1][1], R[2][1], R[0][2], R[1][2], R[2][2]];
    const common = { rot, half_px: [width / 2, height / 2], pan: [v.panX, v.panY], scale: baseScale(width, height) * v.zoom, ratio };
    const n = points.length;
    if (!gpu.buffers || gpu.buffers.n !== n || gpu.buffers.cloud !== cloud || gpu.buffers.data !== data) {
      if (gpu.buffers) Object.values(gpu.buffers.gl).forEach((b) => b.destroy());
      const gl = {
        position: regl.buffer(cloud.xyz),
        color: regl.buffer(data.color),
        size: regl.buffer(data.size),
        flag: regl.buffer(data.flag),
      };
      // halo for selected points: dark, larger, same positions
      const hp = new Float32Array(data.halo.length * 3);
      const hs = new Float32Array(data.halo.length);
      const hc = new Float32Array(data.halo.length * 3);
      data.halo.forEach((i, k) => {
        hp.set(cloud.xyz.subarray(3 * i, 3 * i + 3), 3 * k);
        hs[k] = data.size[i] * 1.5;
        hc.set(haloColor, 3 * k);
      });
      gl.hpos = regl.buffer(hp);
      gl.hsize = regl.buffer(hs);
      gl.hcol = regl.buffer(hc);
      gl.hflag = regl.buffer(new Float32Array(data.halo.length));
      gpu.buffers = { n, cloud, data, gl };
    }
    const { gl } = gpu.buffers;
    regl.poll();
    regl.clear({ color: [0, 0, 0, 0], depth: 1 });
    if (data.halo.length) {
      draw({ ...common, position: gl.hpos, color: gl.hcol, size: gl.hsize, flag: gl.hflag, count: data.halo.length, sizeMul: 1 });
    }
    draw({ ...common, position: gl.position, color: gl.color, size: gl.size, flag: gl.flag, count: n, sizeMul: 1 });
  };
  useEffect(() => {
    renderRef.current();
  }, [view, cloud, data, width, height, ratio, glError]);

  /* ---- interaction ---- */
  const local = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const wheel = (event) => {
      event.preventDefault();
      onViewChange(zoom3d(viewRef.current, wheelFactor(event.deltaY, { deltaMode: event.deltaMode, ctrl: event.ctrlKey })));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [onViewChange]);
  const onDown = (event) => {
    dragRef.current = { last: [event.clientX, event.clientY], start: [event.clientX, event.clientY], moved: false, pan: event.button === 2 || event.shiftKey || event.altKey };
  };
  const onMove = (event) => {
    const drag = dragRef.current;
    if (drag) {
      const dx = event.clientX - drag.last[0];
      const dy = event.clientY - drag.last[1];
      drag.last = [event.clientX, event.clientY];
      if (!drag.moved && Math.hypot(event.clientX - drag.start[0], event.clientY - drag.start[1]) > 3) drag.moved = true;
      if (drag.moved) {
        const v = viewRef.current;
        onViewChange(drag.pan ? { ...v, panX: v.panX + dx, panY: v.panY + dy } : orbit(v, dx, dy));
        onHover(-1, 0, 0);
        return;
      }
    }
    const [x, y] = local(event);
    onHover(pickPoint(proj, x, y, 8), x, y);
  };
  const onUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved && event.button === 0) {
      const [x, y] = local(event);
      const i = pickPoint(proj, x, y, 8);
      if (i >= 0 && onPick) onPick(i, event);
    }
  };

  /* ---- axes gizmo ---- */
  const axes = useMemo(() => {
    const o = projectPoint(view, 0, 0, 0, 0, 0);
    return [["UMAP 1", 1, 0, 0], ["UMAP 2", 0, 1, 0], ["UMAP 3", 0, 0, 1]].map(([label, x, y, z]) => {
      const p = projectPoint(view, x, y, z, 0, 0);
      return { label, dx: (p.sx - o.sx) * 26, dy: (p.sy - o.sy) * 26, front: p.depth >= 0 };
    });
  }, [view]);
  const hov = hoveredIndex >= 0 && hoveredIndex < proj.sx.length ? [proj.sx[hoveredIndex], proj.sy[hoveredIndex]] : null;

  if (glError) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", color: ink }}>
        3D view not available (WebGL: {glError})
      </div>
    );
  }
  return (
    <div
      ref={wrapRef}
      style={{ width, height, position: "relative", cursor: dragRef.current ? "grabbing" : "grab", userSelect: "none", touchAction: "none" }}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={() => {
        dragRef.current = null;
        onHover(-1, 0, 0);
      }}
      onDoubleClick={() => (onResetRequest ? onResetRequest() : onViewChange(defaultView3d()))}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} width={Math.floor(width * ratio)} height={Math.floor(height * ratio)} style={{ width, height, display: "block" }} />
      <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
        {hov && <circle cx={hov[0]} cy={hov[1]} r={baseSize * 0.9 + 4} fill="none" stroke={ink} strokeWidth={2} />}
        <g transform={`translate(44,${height - 40})`} fontSize={10.5} fill={ink} stroke={ink}>
          {axes.map((a) => (
            <g key={a.label} opacity={a.front ? 1 : 0.45}>
              <line x1={0} y1={0} x2={a.dx} y2={a.dy} strokeWidth={1.4} />
              <text x={a.dx * 1.18 + (a.dx >= 0 ? 2 : -2)} y={a.dy * 1.18 + 3} stroke="none" textAnchor={a.dx >= 0 ? "start" : "end"}>{a.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
