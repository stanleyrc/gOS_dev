import React from "react";
import { Tag } from "antd";
import { readableInk } from "../../helpers/singleCell/contrast";

/** An antd Tag filled with `color` (a clone / patient colour) whose text stays readable on light fills. */
export default function ColorTag({ color, style, ...rest }) {
  return <Tag color={color} style={color ? { color: readableInk(color), ...style } : style} {...rest} />;
}
