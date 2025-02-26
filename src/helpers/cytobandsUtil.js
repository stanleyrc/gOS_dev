// Define a lookup table of cytobands with their styles
const cytobandStyles = {
  gneg: {
    color: "#FFFFFF",
    titleColor: "#000000",
    description: "White (unstained, gene-rich regions)",
  },
  gpos25: {
    color: "#E0E0E0",
    titleColor: "#000000",
    description: "Very Light Gray (lightly stained)",
  },
  gpos50: {
    color: "#909090",
    titleColor: "#FFFFFF",
    description: "Medium Gray",
  },
  gpos75: {
    color: "#606060",
    titleColor: "#FFFFFF",
    description: "Dark Gray",
  },
  gpos100: {
    color: "#000000",
    titleColor: "#FFFFFF",
    description: "Black (densely stained, heterochromatic)",
  },
  acen: {
    color: "#FF0000",
    titleColor: "#FFFFFF",
    description: "Red (centromere regions)",
  },
  stalk: {
    color: "#00008B",
    titleColor: "#FFFFFF",
    description:
      "Dark Blue (ribosomal RNA regions, e.g., p-arms of chr13-15, 21-22)",
  },
  gvar: {
    color: "#FFFF00",
    titleColor: "#000000",
    description: "Yellow (variable heterochromatin)",
  },
};

export function setCytobandProperties(cytoband, chromoBins) {
  cytoband.startPoint = parseInt(cytoband.startPoint);
  cytoband.endPoint = parseInt(cytoband.endPoint);
  cytoband.chromosomeTitle = `chr${cytoband.chromosome}`;
  cytoband.chromosomeColor = chromoBins[`${cytoband.chromosome}`].color;
  cytoband.startPlace =
    chromoBins[`${cytoband.chromosome}`].startPlace + cytoband.startPoint;
  cytoband.endPlace =
    chromoBins[`${cytoband.chromosome}`].startPlace + cytoband.endPoint;

  // Return the style for the specified stain or a default style if not found
  let style = cytobandStyles[cytoband.stain] || {
    color: "#FFFFFF",
    titleColor: "#000000",
    description: "Unknown cytoband stain",
  };

  cytoband.color = style.color;
  cytoband.titleColor = style.titleColor;
  cytoband.description = style.description;

  if (cytoband.stain === "acen" && cytoband.title.charAt(0) === "p") {
    cytoband.points = [
      [cytoband.startPlace, 0],
      [cytoband.endPlace, 0.5],
      [cytoband.startPlace, 1],
    ];
    cytoband.segments = [
      [
        [cytoband.startPlace, 0],
        [cytoband.endPlace, 0.5],
      ],
      [
        [cytoband.endPlace, 0.5],
        [cytoband.startPlace, 1],
      ],
    ];
  } else if (cytoband.stain === "acen" && cytoband.title.charAt(0) === "q") {
    cytoband.points = [
      [cytoband.startPlace, 0.5],
      [cytoband.endPlace, 0],
      [cytoband.endPlace, 1],
    ];
    cytoband.segments = [
      [
        [cytoband.startPlace, 0.5],
        [cytoband.endPlace, 0],
      ],
      [
        [cytoband.startPlace, 0.5],
        [cytoband.endPlace, 1],
      ],
    ];
  } else if (+cytoband.startPoint < 1) {
    let offset = 1e5;
    cytoband.points = [
      [cytoband.startPlace + offset, 0],
      [cytoband.endPlace, 0],
      [cytoband.endPlace, 1],
      [cytoband.startPlace + offset, 1],
      [cytoband.startPlace + 0.2 * offset, 0.66],
      [cytoband.startPlace, 0.5],
      [cytoband.startPlace + 0.2 * offset, 0.33],
    ];
    cytoband.segments = [
      [
        [cytoband.startPlace + offset, 0],
        [cytoband.endPlace, 0],
      ],
      [
        [cytoband.endPlace, 1],
        [cytoband.startPlace + offset, 1],
      ],
      [
        [cytoband.startPlace + offset, 0],
        [cytoband.startPlace + 0.2 * offset, 0.33],
      ],
      [
        [cytoband.startPlace + 0.2 * offset, 0.33],
        [cytoband.startPlace, 0.5],
      ],
      [
        [cytoband.startPlace, 0.5],
        [cytoband.startPlace + 0.2 * offset, 0.66],
      ],
      [
        [cytoband.startPlace + 0.2 * offset, 0.66],
        [cytoband.startPlace + offset, 1],
      ],
    ];
  } else if (
    +chromoBins[`${cytoband.chromosome}`].endPoint === +cytoband.endPoint
  ) {
    let offset = 1e5;
    cytoband.points = [
      [cytoband.startPlace, 0],
      [cytoband.endPlace - offset, 0],
      [cytoband.endPlace - 0.2 * offset, 0.33],
      [cytoband.endPlace, 0.5],
      [cytoband.endPlace - 0.2 * offset, 0.66],
      [cytoband.endPlace - offset, 1],
      [cytoband.startPlace, 1],
    ];
    cytoband.segments = [
      [
        [cytoband.startPlace, 0],
        [cytoband.endPlace - offset, 0],
      ],
      [
        [cytoband.endPlace - offset, 0],
        [cytoband.endPlace - 0.2 * offset, 0.33],
      ],
      [
        [cytoband.endPlace - 0.2 * offset, 0.33],
        [cytoband.endPlace, 0.5],
      ],
      [
        [cytoband.endPlace, 0.5],
        [cytoband.endPlace - 0.2 * offset, 0.66],
      ],
      [
        [cytoband.endPlace - 0.2 * offset, 0.66],
        [cytoband.endPlace - offset, 1],
      ],
      [
        [cytoband.endPlace - offset, 1],
        [cytoband.startPlace, 1],
      ],
    ];
  } else {
    cytoband.points = [
      [cytoband.startPlace, 0],
      [cytoband.endPlace, 0],
      [cytoband.endPlace, 1],
      [cytoband.startPlace, 1],
    ];
    cytoband.segments = [
      [
        [cytoband.startPlace, 0],
        [cytoband.endPlace, 0],
      ],
      [
        [cytoband.endPlace, 1],
        [cytoband.startPlace, 1],
      ],
    ];
  }

  return cytoband;
}
