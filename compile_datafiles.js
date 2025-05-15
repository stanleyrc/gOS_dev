const fs = require("fs");
const path = require("path");

const caseReportContentFolder =
  "/gpfs/home/xanthc01/lab/external/mskiweb/xanthc01/content/case_report_content";
const datafilesPrefixFolder = "/gpfs/home/xanthc01/lab/external";

// Path to datasets.json
const datasetsFile = path.join(caseReportContentFolder, "datasets.json");

// Check if datasets.json exists
if (!fs.existsSync(datasetsFile)) {
  console.error(`Error: datasets.json not found at ${datasetsFile}`);
  process.exit(1);
}

// Read and parse datasets.json
const datasets = JSON.parse(fs.readFileSync(datasetsFile, "utf8"));

datasets.forEach((dataset) => {
  const datafilesPath = dataset.datafilesPath.replace(
    "/external/imielinskilab",
    ""
  );
  const dataPath = dataset.dataPath.replace("/external/imielinskilab", "");

  const fullDatafilePath = path.join(datafilesPrefixFolder, datafilesPath);
  const fullDataPath = path.join(datafilesPrefixFolder, dataPath);

  if (!fs.existsSync(fullDatafilePath)) {
    console.warn(`Warning: datafiles.json not found at ${fullDatafilePath}`);
    return;
  }

  const datasetId = dataset.id;
  console.log(`Processing dataset: ${datasetId}`);

  const compiledData = [];

  // Read datafiles.json and extract "pair" values
  const datafiles = JSON.parse(fs.readFileSync(fullDatafilePath, "utf8"));

  datafiles.forEach((entry) => {
    const pair = entry.pair;
    const metadataFile = path.join(fullDataPath, pair, "metadata.json");

    if (!fs.existsSync(metadataFile)) {
      console.warn(`Warning: metadata.json not found at ${metadataFile}`);
      return;
    }

    // Read and parse metadata.json
    const metadataContent = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

    // Spread metadataContent into compiledData array
    if (Array.isArray(metadataContent)) {
      compiledData.push(...metadataContent);
    } else {
      console.warn(
        `Warning: metadata.json at ${metadataFile} is not an array, skipping...`
      );
    }
  });

  // Write to compiled_datafiles.json
  const compiledDatafilePath = path.join(
    fullDataPath,
    "compiled_datafiles.json"
  );
  fs.writeFileSync(
    compiledDatafilePath,
    JSON.stringify(compiledData, null, 2),
    "utf8"
  );

  console.log(`Compiled datafiles.json created at: ${compiledDatafilePath}`);

  // Backup old datafiles.json before replacing it
  const backupDatafilePath = path.join(fullDataPath, "datafiles_backup.json");
  if (fs.existsSync(fullDatafilePath)) {
    fs.renameSync(fullDatafilePath, backupDatafilePath);
    console.log(`Backup created: ${backupDatafilePath}`);
  }

  // Replace datafiles.json with compiled_datafiles.json
  fs.renameSync(compiledDatafilePath, fullDatafilePath);
  console.log(`Replaced ${fullDatafilePath} with compiled data.`);
});
