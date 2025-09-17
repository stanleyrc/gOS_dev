import { locationToDomains } from "./utility.js";

export function parseCenterFromLocus(locus) {
  try {
    if (!locus) return { chr: undefined, position: undefined };
    const part = String(locus).split(/[|\s]+/)[0];
    const [chr, coords] = part.split(":");
    if (!coords) return { chr: chr || undefined, position: undefined };
    if (coords.includes("-")) {
      const [startStr, endStr] = coords.split("-");
      const start = parseInt(startStr.replace(/,/g, ""), 10);
      const end = parseInt(endStr.replace(/,/g, ""), 10);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return { chr, position: Math.floor((start + end) / 2) };
      }
    } else {
      const position = parseInt(coords.replace(/,/g, ""), 10);
      return { chr, position };
    }
  } catch (e) {
    // ignore parse errors
  }
  return { chr: undefined, position: undefined };
}

export function lociToDomains(chromoBins, loci) {
  // Extract chromosome and position parts
  let [chromosome, positions] = loci.split(":");
  let [start, end] = positions.split("-");

  // Remove "chr" prefix and fractional parts of numbers
  let parsedChromosome = chromosome.replace("chr", "");
  let parsedStart = Math.floor(parseFloat(start)); // Round down to integer
  let parsedEnd = Math.floor(parseFloat(end)); // Round down to integer

  // Construct the desired location format
  let location = `${parsedChromosome}:${parsedStart}-${parsedChromosome}:${parsedEnd}`;
  return locationToDomains(chromoBins, location);
}

export function domainToLoci(chromoBins, domain) {
  let from = domain[0];
  let to = domain[1];
  let startLoci, endLoci;
  Object.keys(chromoBins).forEach((key, i) => {
    if (
      from <= chromoBins[key].endPlace &&
      from >= chromoBins[key].startPlace
    ) {
      startLoci = {
        chromosome: key,
        point: from - chromoBins[key].startPlace + chromoBins[key].startPoint,
      };
    }
    if (to <= chromoBins[key].endPlace && to >= chromoBins[key].startPlace) {
      endLoci = {
        chromosome: key,
        point: to - chromoBins[key].startPlace + chromoBins[key].startPoint,
      };
    }
  });
  let location = {
    chromosome: startLoci.chromosome,
    startPoint: startLoci.point,
    endPoint:
      endLoci.chromosome === startLoci.chromosome
        ? endLoci.point
        : chromoBins[startLoci.chromosome].endPoint,
  };
  return `chr${location.chromosome}:${location.startPoint}-${location.endPoint}`;
}
