const http = require("http");
const url = require("url");
const sqlite3 = require("sqlite3").verbose();
const qs = require("querystring");

// Replace 'case_report.sqlite3' with your database name
const db = new sqlite3.Database("case_report.sqlite3");

const server = http.createServer((req, res) => {
  // Parse the URL to get the pathname
  const { pathname } = url.parse(req.url);

  // Handle different routes based on the URL path
  if (pathname === "/case-reports" && req.method === "POST") {
    handleCaseReportsRequest(req, res);
  } else if (pathname === "/case-reports-count" && req.method === "POST") {
    handleCaseReportsCountRequest(req, res);
  } else if (pathname === "/case-reports-filters") {
    handleCaseReportsFilters(req, res);
  } else {
    // Handle other routes or return a 404 response
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

function handleCaseReportsRequest(req, res) {
  let data = "";

  // Collect data from the request body
  req.on("data", (chunk) => {
    data += chunk.toString();
  });

  // Process data when the request body has been fully received
  req.on("end", () => {
    try {
      const requestBody = qs.parse(data);

      // Extract the inferred_sex parameter from the request body
      const inferredSex = requestBody.inferred_sex;
      let page = requestBody.page;
      let perPage = requestBody.per_page;

      console.log(data, requestBody, inferredSex, page, perPage);

      // Construct the SQL query based on the provided parameter
      let sqlQuery = "SELECT * FROM case_reports";
      const params = [];
      const conditions = [];

      if (inferredSex) {
        conditions.push("inferred_sex = ?");
        params.push(inferredSex);
      }

      if (conditions.length > 0) {
        sqlQuery += " WHERE " + conditions.join(" AND ");
      }

      if (page && perPage) {
        page = parseInt(page, 10) || 1;
        perPage = parseInt(perPage, 10) || 10;
        let offset = (page - 1) * perPage;
        sqlQuery += ` LIMIT ${perPage} OFFSET ${offset}`;
      }

      console.log(sqlQuery);
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
    } catch (error) {
      console.error("Error processing request:", error.message);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bad Request" }));
    }
  });
}

function handleCaseReportsCountRequest(req, res) {
  let data = "";

  // Collect data from the request body
  req.on("data", (chunk) => {
    data += chunk.toString();
  });

  // Process data when the request body has been fully received
  req.on("end", () => {
    try {
      const requestBody = qs.parse(data);

      // Extract the inferred_sex parameter from the request body
      const inferredSex = requestBody.inferred_sex;
      let page = requestBody.page;
      let perPage = requestBody.per_page;

      console.log(data, requestBody, inferredSex, page, perPage);

      // Construct the SQL query based on the provided parameter
      let sqlQuery = "SELECT COUNT(*) AS total FROM case_reports";
      const params = [];
      const conditions = [];

      if (inferredSex) {
        conditions.push("inferred_sex = ?");
        params.push(inferredSex);
      }

      if (conditions.length > 0) {
        sqlQuery += " WHERE " + conditions.join(" AND ");
      }

      console.log(sqlQuery);
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
    } catch (error) {
      console.error("Error processing request:", error.message);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bad Request" }));
    }
  });
}

function handleCaseReportsFilters(req, res) {
  // Parse the URL to get the query parameters
  const parsedUrl = url.parse(req.url, true);
  const query = parsedUrl.query;

  // Define the SQL query based on the provided parameters
  let sqlQuery = "SELECT * FROM cases";
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

    // Send the JSON response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rows));
  });
}

// Set the port for the server
const PORT = 3000;

// Start the server
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
