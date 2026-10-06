import React, { useRef } from "react";

/**
 * Horizontal drag bar for resizing a panel's height. onResize(dy) fires while
 * dragging (pixels from the drag start), onCommit(dy) once on release;
 * double-click calls onReset.
 */
export default function HeightHandle({ onResize, onCommit, onReset, title }) {
  const start = useRef(null);
  const onMouseDown = (event) => {
    event.preventDefault();
    start.current = event.clientY;
    let dy = 0;
    const move = (e) => {
      dy = e.clientY - start.current;
      onResize(dy);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit(dy);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return <div className="sc-height-handle" title={title} onMouseDown={onMouseDown} onDoubleClick={onReset} />;
}
