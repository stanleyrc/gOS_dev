const sqlite3 = require("sqlite3").verbose();

// Replace 'case_report.sqlite3' with your desired database name
const db = new sqlite3.Database("case_report.sqlite3");

// Define the SQL query to create the 'cases' table
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS case_reports (
    id INTEGER PRIMARY KEY,
    pair TEXT UNIQUE,
    tumor_type_final TEXT,
    disease TEXT,
    primary_site TEXT,
    inferred_sex TEXT,
    dlrs REAL,
    snv_count INTEGER,
    sv_count INTEGER,
    loh_fraction REAL,
    purity REAL,
    ploidy REAL,
    beta REAL,
    gamma REAL
  )
`;

// Run the query to create the table
db.run(createTableQuery, (err) => {
  if (err) {
    console.error("Error creating table:", err.message);
    db.close();
    return;
  }

  // Create indexes after the table is created
  const createIndexesQuery = `
    CREATE INDEX idx_pair ON cases(pair);
    CREATE INDEX idx_tumor_type_final ON cases(tumor_type_final);
    CREATE INDEX idx_disease ON cases(disease);
    CREATE INDEX idx_primary_site ON cases(primary_site);
    CREATE INDEX idx_inferred_sex ON cases(inferred_sex);
  `;

  // Run the query to create indexes
  db.exec(createIndexesQuery, (err) => {
    if (err) {
      console.error("Error creating indexes:", err.message);
    } else {
      console.log("Indexes created successfully");
    }

    // Close the database connection after running the queries
    db.close();
  });
});
