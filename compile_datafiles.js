const fs = require("fs");
const path = require("path");

const dataFolderPath = "./public/data";
const outputFolderPath = "./public";

const allCases = [];

function updateAllCases() {
  allCases.length = 0;

  // Read each case folder
  fs.readdirSync(dataFolderPath).forEach((caseFolder) => {
    const caseFolderPath = path.join(dataFolderPath, caseFolder);
    const metadataPath = path.join(caseFolderPath, "metadata.json");

    // Check if metadata.json exists in the case folder
    if (fs.existsSync(metadataPath)) {
      // Read the content of metadata.json
      const metadataContent = fs.readFileSync(metadataPath, "utf8");

      try {
        // Parse JSON content and push to the array
        const metadata = JSON.parse(metadataContent);
        allCases.push(...metadata);
      } catch (error) {
        console.error(
          `Error parsing metadata.json in ${caseFolderPath}: ${error.message}`
        );
      }
    }
  });

  // Write the concatenated data to all_cases.json
  const allCasesPath = path.join(outputFolderPath, "datafiles.json");
  fs.writeFileSync(allCasesPath, JSON.stringify(allCases, null, 2));

  console.log(
    `datafiles.json has been updated with ${allCases.length} entries.`
  );
}

// Initial update
updateAllCases();
