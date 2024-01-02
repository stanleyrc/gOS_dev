const http = require("http");
const url = require("url");
const sqlite3 = require("sqlite3").verbose();

// Replace 'case_report.sqlite3' with your database name
const db = new sqlite3.Database("case_report.sqlite3");

const server = http.createServer((req, res) => {
  // Parse the URL to get the query parameters
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname; // Extract the URL path

  // Handle different routes based on the URL path
  if (pathname === "/case-reports") {
    handleCaseReportsRequest(parsedUrl.query, res);
  } else if (pathname === "/case-reports-count") {
    handleCaseReportsCountRequest(parsedUrl.query, res);
  } else {
    // Handle other routes or return a 404 response
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

let handleCaseReportsRequest = (query, res) => {
  // Define the SQL query based on the provided parameters
  let sqlQuery = "SELECT * FROM case_reports";
  const params = [];
  const conditions = [];

  if (query.inferred_sex) {
    conditions.push("inferred_sex = ?");
    params.push(query.inferred_sex);
  }

  if (conditions.length > 0) {
    sqlQuery += " WHERE " + conditions.join(" AND ");
  }

  if (query.page && query.per_page) {
    const page = parseInt(query.page, 10) || 1;
    const perPage = parseInt(query.per_page, 10) || 10;
    const offset = (page - 1) * perPage;
    sqlQuery += ` LIMIT ${perPage} OFFSET ${offset}`;
  }

  // Execute the SQL query
  db.all(sqlQuery, params, (err, rows) => {
    if (err) {
      console.error("Error querying database:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
      return;
    }

    // Send the JSON response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rows));
  });
};

let handleCaseReportsCountRequest = (query, res) => {
  // Define the SQL query based on the provided parameters
  let sqlQuery = "SELECT COUNT(*) AS total FROM case_reports";
  const params = [];
  const conditions = [];

  if (query.inferred_sex) {
    conditions.push("inferred_sex = ?");
    params.push(query.inferred_sex);
  }

  if (conditions.length > 0) {
    sqlQuery += " WHERE " + conditions.join(" AND ");
  }

  // Execute the SQL query
  db.all(sqlQuery, params, (err, rows) => {
    if (err) {
      console.error("Error querying database:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
      return;
    }
    let total = rows[0]?.total;
    // Send the JSON response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ total }));
  });
};

// Set the port for the server
const PORT = 3000;

// Start the server
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
