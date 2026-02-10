import * as d3 from "d3";
import { splitFloat64 } from "../../helpers/utility";
import { SHAPE_TYPES, SHAPE_SIZES } from "./constants";

export function getShapeType(interval) {
  if (!interval.annotation) return SHAPE_TYPES.CIRCLE;

  const annotations = interval.annotation.split(";").map((item) => {
    if (!item.includes(":")) return null;
    const [key, value] = item.split(":");
    return { key: key.trim(), value: value.trim() };
  });

  const oncogenicity = annotations.find(
    (item) => item?.key === "Oncogenicity"
  )?.value;
  const effect = annotations.find((item) => item?.key === "Effect")?.value;

  let shape = SHAPE_TYPES.CIRCLE;
  if (oncogenicity) shape = SHAPE_TYPES.DIAMOND;
  if (effect) shape = SHAPE_TYPES.TRIANGLE;
  return shape;
}

export function getShapeSize(shapeType) {
  return SHAPE_SIZES[shapeType] || SHAPE_SIZES[SHAPE_TYPES.CIRCLE];
}

export function packColor(colorStr) {
  const color = d3.color(colorStr);
  if (!color) return 0;
  return color.r * 65536 + color.g * 256 + color.b;
}

export function prepareIntervalData(intervals) {
  const n = intervals.length;
  const dataXHigh = new Float32Array(n);
  const dataXLow = new Float32Array(n);
  const dataY = new Float32Array(n);
  const dataColor = new Float32Array(n);
  const dataShape = new Float32Array(n);
  const dataOpacity = new Float32Array(n);
  const dataSize = new Float32Array(n);

  intervals.forEach((d, i) => {
    // -1 offset to align with IGV browser (matches original Konva implementation)
    const x = Math.floor((d.startPlace + d.endPlace) / 2) - 1;
    const [xHigh, xLow] = splitFloat64(x);

    dataXHigh[i] = xHigh;
    dataXLow[i] = xLow;
    dataY[i] = d.y;
    dataColor[i] = packColor(d.fill || d.color);
    const shape = getShapeType(d);
    dataShape[i] = shape;
    dataOpacity[i] = d.isProteinCoded ? 1.0 : 0.33;
    dataSize[i] = getShapeSize(shape);
  });

  return { dataXHigh, dataXLow, dataY, dataColor, dataShape, dataOpacity, dataSize };
}
