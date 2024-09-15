const fs = require("fs");
const path = require("path");

const dataFolderPath = "./case-reports-data";
const outputFolderPath = "./case-reports";

const allCases = [];

function updateAllCases() {
  let ignoredCaseReports = [];
  const ignoredCaseReportsPath = path.join(
    dataFolderPath,
    "ignored-case-reports.json"
  );

  if (fs.existsSync(ignoredCaseReportsPath)) {
    const ignoredCaseReportsContent = fs.readFileSync(
      ignoredCaseReportsPath,
      "utf8"
    );

    try {
      ignoredCaseReports = JSON.parse(ignoredCaseReportsContent);
    } catch (error) {
      console.error(
        `Error parsing visibles.json in ${dataFolderPath}: ${error.message}`
      );
    }
  }

  fs.readdirSync(dataFolderPath).forEach((caseFolder) => {
    const caseFolderPath = path.join(dataFolderPath, caseFolder);
    const metadataPath = path.join(caseFolderPath, "metadata.json");

    if (fs.existsSync(metadataPath)) {
      const metadataContent = fs.readFileSync(metadataPath, "utf8");

      try {
        let metadata = JSON.parse(metadataContent);
        if (metadata.length > 0) {
          metadata[0].visible = !ignoredCaseReports.includes(metadata[0].pair);
        }

        allCases.push(...metadata);
      } catch (error) {
        console.error(
          `Error parsing metadata.json in ${caseFolderPath}: ${error.message}`
        );
      }
    }
  });

  const allCasesPath = path.join(outputFolderPath, "datafiles.json");
  fs.writeFileSync(allCasesPath, JSON.stringify(allCases, null, 2));

  console.log(
    `datafiles.json has been updated with ${allCases.length} entries.`
  );
}

updateAllCases();
