const LOCATION_SEGMENT = /^([^:\s|-]+):(-?\d+)(?:-(?:([^:\s|-]+):)?(-?\d+))?$/;
const POINT_FLANK = 250;

function resolveEndpoint(chromoBins, chromosome, coordinate) {
  const bin =
    chromoBins && Object.prototype.hasOwnProperty.call(chromoBins, chromosome)
      ? chromoBins[chromosome]
      : null;
  const position = Number(coordinate);
  if (
    !bin ||
    !Number.isSafeInteger(position) ||
    !Number.isSafeInteger(bin.startPoint) ||
    !Number.isSafeInteger(bin.endPoint) ||
    !Number.isSafeInteger(bin.startPlace) ||
    bin.startPoint > bin.endPoint
  ) {
    throw new Error("Invalid genomic location");
  }

  return { bin, position };
}

function endpointToPlace({ bin, position }, clampRange = false) {
  if (clampRange) {
    position = Math.max(bin.startPoint, Math.min(bin.endPoint, position));
  } else if (position < bin.startPoint || position > bin.endPoint) {
    throw new Error("Invalid genomic location");
  }
  return bin.startPlace + (position - bin.startPoint);
}

/**
 * Convert pipe-separated points, same-chromosome shorthand ranges, or explicit
 * endpoint ranges to genome domains. Coordinates retain the bins' numbering.
 * Points receive a chromosome-clamped 250-base flank; explicit bounds stay exact.
 * Only generated viewports should opt into clampRanges to clip range endpoints.
 * Points always require an in-bounds coordinate. Malformed, unknown, unsafe, or
 * reversed segments still throw, even when clipping could hide the invalid data.
 */
export function locationToDomains(
  chromoBins,
  location,
  { clampRanges = false } = {},
) {
  if (typeof location !== "string" || !location.trim()) {
    throw new Error("Invalid genomic location");
  }

  return location.split("|").map((segment) => {
    const match = LOCATION_SEGMENT.exec(segment.trim());
    if (!match) {
      throw new Error("Invalid genomic location");
    }

    const [, chromosome, coordinate, endChromosome, endCoordinate] = match;
    const start = resolveEndpoint(chromoBins, chromosome, coordinate);
    const isPoint = endCoordinate === undefined;
    let domain;
    if (isPoint) {
      const place = endpointToPlace(start);
      const from = Math.max(start.bin.startPoint, start.position - POINT_FLANK);
      const to = Math.min(start.bin.endPoint, start.position + POINT_FLANK);
      domain = [place + from - start.position, place + to - start.position];
    } else {
      const end = resolveEndpoint(
        chromoBins,
        endChromosome || chromosome,
        endCoordinate,
      );
      // Check raw same-chromosome order before clipping either endpoint.
      if (
        (endChromosome || chromosome) === chromosome &&
        start.position > end.position
      ) {
        throw new Error("Invalid genomic location");
      }
      domain = [
        endpointToPlace(start, clampRanges),
        endpointToPlace(end, clampRanges),
      ];
    }

    if (
      !domain.every(Number.isSafeInteger) ||
      domain[0] > domain[1] ||
      (isPoint && domain[0] === domain[1])
    ) {
      throw new Error("Invalid genomic location");
    }
    return domain;
  });
}
