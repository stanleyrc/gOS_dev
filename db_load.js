const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

// Replace 'case_report.sqlite3' with your database name
const db = new sqlite3.Database("./case_report.sqlite3");

// Read data from the JSON file
const jsonData = fs.readFileSync("./public/datafiles.json", "utf8");
const data = JSON.parse(jsonData);

// Delete data from the 'cases' table
const deleteDataQuery = `
  DELETE FROM case_reports`;

// Insert data into the 'cases' table
const insertDataQuery = `
  INSERT INTO case_reports (
    pair,
    tumor_type_final,
    disease,
    primary_site,
    inferred_sex,
    dlrs,
    snv_count,
    sv_count,
    loh_fraction,
    purity,
    ploidy,
    beta,
    gamma
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
// Run the query to create the table
db.run(deleteDataQuery, (err) => {
  if (err) {
    console.error(
      "Deletion of entries in case_reports table failed with error:",
      err.message
    );
    db.close();
    return;
  }
});

data.forEach((item) => {
  db.run(
    insertDataQuery,
    [
      item.pair,
      item.tumor_type_final,
      item.disease,
      item.primary_site || null,
      item.inferred_sex || null,
      item.dlrs || null,
      item.snv_count || null,
      item.sv_count || null,
      item.loh_fraction || null,
      item.purity || null,
      item.ploidy || null,
      item.beta || null,
      item.gamma || null,
    ],
    (err) => {
      if (err) {
        console.error("Error inserting data:", err.message);
      } else {
        console.log(`Data for pair ${item.pair} inserted successfully`);
      }
    }
  );
});

// Close the database connection
db.close();
