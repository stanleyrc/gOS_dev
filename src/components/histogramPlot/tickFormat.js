import * as d3 from "d3";

const decimalFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const siPrefixes = [
  { factor: 1e18, suffix: "E" },
  { factor: 1e15, suffix: "P" },
  { factor: 1e12, suffix: "T" },
  { factor: 1e9, suffix: "G" },
  { factor: 1e6, suffix: "M" },
  { factor: 1e3, suffix: "k" },
];

function decimalFormat(value) {
  return decimalFormatter.format(value);
}

function roundToTwoDecimalPlaces(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCompactDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";

  const absoluteValue = Math.abs(number);
  let prefixIndex = siPrefixes.findIndex(
    ({ factor }) => absoluteValue >= factor,
  );

  const smallestPrefixIndex = siPrefixes.length - 1;
  if (
    prefixIndex === -1 &&
    roundToTwoDecimalPlaces(absoluteValue) >=
      siPrefixes[smallestPrefixIndex].factor
  ) {
    prefixIndex = smallestPrefixIndex;
  }

  if (prefixIndex === -1) return decimalFormat(number);

  while (
    prefixIndex > 0 &&
    roundToTwoDecimalPlaces(
      absoluteValue / siPrefixes[prefixIndex].factor,
    ) >= 1000
  ) {
    prefixIndex -= 1;
  }

  const { factor, suffix } = siPrefixes[prefixIndex];
  return `${decimalFormat(number / factor)}${suffix}`;
}

export function getHistogramTickFormatter(format = "~s") {
  const type = d3.formatSpecifier(format).type;
  return ["s", "%", "p"].includes(type)
    ? formatCompactDecimal
    : d3.format(format);
}

export function formatHistogramValue(value, format = "~s") {
  return getHistogramTickFormatter(format)(value);
}
