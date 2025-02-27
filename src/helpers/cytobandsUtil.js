import * as d3 from "d3";

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
    cytoband.part = "leftCentromere";
  } else if (cytoband.stain === "acen" && cytoband.title.charAt(0) === "q") {
    cytoband.points = [
      [cytoband.startPlace, 0.5],
      [cytoband.endPlace, 0],
      [cytoband.endPlace, 1],
    ];
    cytoband.part = "rightCentromere";
  } else if (+cytoband.startPoint < 1) {
    cytoband.points = [
      [cytoband.startPlace, 0],
      [cytoband.endPlace, 0],
      [cytoband.endPlace, 1],
      [cytoband.startPlace, 1],
    ];
    cytoband.part = "leftEdge";
  } else if (
    +chromoBins[`${cytoband.chromosome}`].endPoint === +cytoband.endPoint
  ) {
    cytoband.points = [
      [cytoband.startPlace, 0],
      [cytoband.endPlace, 0],
      [cytoband.endPlace, 1],
      [cytoband.startPlace, 1],
    ];
    cytoband.part = "rightEdge";
  } else {
    cytoband.points = [
      [cytoband.startPlace, 0],
      [cytoband.endPlace, 0],
      [cytoband.endPlace, 1],
      [cytoband.startPlace, 1],
    ];
    cytoband.part = "middle";
  }

  return cytoband;
}

export function getChromosomeOutlines(cytobands, chromoBins) {
  let chromosomeOutlines = [];
  d3.groups(
    cytobands.filter((e) => e.part !== "middle"),
    (d) => d.chromosome
  ).forEach(([chromosome, bands]) => {
    let hash = Object.fromEntries(bands.map((item) => [item.part, item]));
    // left part of the chromosome
    let pointA = [hash.leftEdge.startPlace, 1];
    let pointB = [hash.leftCentromere.startPlace, 1];
    let pointM1 = [hash.leftCentromere.endPlace, 0.5];
    let pointC = [hash.leftCentromere.startPlace, 0];
    let pointD = [hash.leftEdge.startPlace, 0];
    // right part of the chromosome
    let pointM2 = [hash.rightCentromere.startPlace, 0.5];
    let pointE = [hash.rightCentromere.endPlace, 1];
    let pointF = [hash.rightEdge.endPlace, 1];
    let pointG = [hash.rightEdge.endPlace, 0];
    let pointH = [hash.rightCentromere.endPlace, 0];
    chromosomeOutlines.push({
      chromosome,
      color: chromoBins[`${chromosome}`].color,
      pointsLeft: [pointA, pointB, pointM1, pointC, pointD],
      pointsRight: [pointM2, pointE, pointF, pointG, pointH],
    });
  });
  return chromosomeOutlines;
}

export function createChromosomePaths(pointsLeft, pointsRight, arcOffset = 3) {
  // pointsLeft = [ [Ax,Ay], [Bx,By], [Mx,My], [Cx,Cy], [Dx,Dy] ]
  // pointsRight= [ [Mx,My], [Ex,Ey], [Fx,Fy], [Gx,Gy], [Hx,Hy] ]

  // Destructure for readability
  const [A, B, M1, C, D] = pointsLeft;
  const [M2, E, F, G, H] = pointsRight;
  // Often M1 and M2 are the same physical point (the centromere),
  // but you can keep them distinct if needed.

  let A1 = [A[0] + arcOffset, A[1]];
  let D1 = [D[0] + arcOffset, D[1]];
  let F1 = [F[0] - arcOffset, F[1]];
  let G1 = [G[0] - arcOffset, G[1]];
  // A small helper for midpoints
  function midpoint(p1, p2) {
    return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  }

  // --- LEFT PART PATH (A-B-M-C-D with arc from D→A) ---
  const leftPath = d3.path();

  // Move to A
  leftPath.moveTo(A1[0], A1[1]);
  // Straight lines: A->B->M->C->D
  leftPath.lineTo(B[0], B[1]);
  leftPath.lineTo(M1[0], M1[1]);
  leftPath.lineTo(C[0], C[1]);
  leftPath.lineTo(D1[0], D1[1]);

  // Arc from D back to A
  {
    const midDA = midpoint(D, A);
    // Shift the control point to create a bulge (up/down/left/right).
    // Here we shift in Y by -arcOffsetLeft for a slight upward arc.
    const controlDA = [midDA[0] - arcOffset, midDA[1]];
    leftPath.quadraticCurveTo(controlDA[0], controlDA[1], A1[0], A1[1]);
  }

  leftPath.closePath();

  // --- RIGHT PART PATH (M-E-F-G-H with arc F→G) ---
  const rightPath = d3.path();

  // Move to M2
  rightPath.moveTo(M2[0], M2[1]);
  // Straight lines: M->E->F
  rightPath.lineTo(E[0], E[1]);
  rightPath.lineTo(F1[0], F1[1]);

  // Arc from F to G
  {
    const midFG = midpoint(F, G);
    // Shift control point downward for bulge (you can adjust sign if you like).
    const controlFG = [midFG[0] + arcOffset, midFG[1]];
    rightPath.quadraticCurveTo(controlFG[0], controlFG[1], G1[0], G1[1]);
  }

  // Straight lines: G->H->M
  rightPath.lineTo(H[0], H[1]);
  rightPath.lineTo(M2[0], M2[1]);

  rightPath.closePath();

  // Return both paths as strings
  return {
    left: leftPath.toString(),
    right: rightPath.toString(),
  };
}
