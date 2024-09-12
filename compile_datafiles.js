const fs = require("fs");
const path = require("path");

const dataFolderPath = "./public/data";
const outputFolderPath = "./public";

const allCases = [];

function updateAllCases(fracRandomInvisible = null) {
  allCases.length = 0;

  // Read each case folder
  fs.readdirSync(dataFolderPath).forEach((caseFolder) => {
    if (ignoreCases.includes(caseFolder)) {
      return;
    }
    const caseFolderPath = path.join(dataFolderPath, caseFolder);
    const metadataPath = path.join(caseFolderPath, "metadata.json");

    // Check if metadata.json exists in the case folder
    if (fs.existsSync(metadataPath)) {
      // Read the content of metadata.json
      const metadataContent = fs.readFileSync(metadataPath, "utf8");

      try {
        // Parse JSON content
        const metadata = JSON.parse(metadataContent);

        // Add visible attribute with default value true
        metadata.visible = true;

        allCases.push(metadata);
      } catch (error) {
        console.error(
          `Error parsing metadata.json in ${caseFolderPath}: ${error.message}`
        );
      }
    }
  });

  // If fracRandomInvisible is not null, set visible to false for a fraction of the cases
  if (fracRandomInvisible !== null) {
    const numInvisible = Math.floor(allCases.length * fracRandomInvisible);
    const indices = Array.from({ length: allCases.length }, (_, i) => i);
    const shuffledIndices = indices
      .sort(() => 0.5 - Math.random())
      .slice(0, numInvisible);

    shuffledIndices.forEach((index) => {
      allCases[index].visible = false;
    });
  }

  // Write the concatenated data to all_cases.json
  const allCasesPath = path.join(outputFolderPath, "datafiles.json");
  fs.writeFileSync(allCasesPath, JSON.stringify(allCases, null, 2));

  console.log(
    `datafiles.json has been updated with ${allCases.length} entries.`
  );
}

updateAllCases();

// randomly set 10% of the cases to invisible
// updateAllCases(0.1);

function generateMockMaskFile(datafilesPath, fracPairsToInclude) {
  const datafilesContent = fs.readFileSync(datafilesPath, "utf8");
  const datafiles = JSON.parse(datafilesContent);

  const mask = {};
  const numPairsToInclude = Math.floor(datafiles.length * fracPairsToInclude);
  const indices = Array.from({ length: datafiles.length }, (_, i) => i);
  const shuffledIndices = indices
    .sort(() => 0.5 - Math.random())
    .slice(0, numPairsToInclude);

  shuffledIndices.forEach((index) => {
    const pair = datafiles[index];
    const pairName = pair.pair;
    const attributes = Object.keys(pair).filter(
      (attr) => attr !== "pair_name" && attr !== "visible"
    ); // Exclude pair_name and visible attributes

    if (attributes.length > 0) {
      const randomAttribute =
        attributes[Math.floor(Math.random() * attributes.length)];
      mask[pairName] = { [randomAttribute]: true };
    }
  });

  return mask;
}

// Example usage:
// const datafilesPath = path.join(outputFolderPath, "datafiles.json");
// const fracPairsToInclude = 0.2; // 20% of pairs to include in the mask file
// const mockMaskFile = generateMockMaskFile(datafilesPath, fracPairsToInclude);
// const mockMaskFilePath = path.join(outputFolderPath, "mock_mask.json");
// fs.writeFileSync(mockMaskFilePath, JSON.stringify(mockMaskFile, null, 2));
