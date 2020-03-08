const express = require("express");
const mysql = require("mysql");
const axios = require("axios");
const app = express();
const port = 3000;
const dbConfig = require('./config/config.js');

console.log(dbConfig);
const conn = mysql.createConnection(dbConfig);

conn.connect(function(err) {
  if (err) throw err;
  // console.log("Connected!");
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/lon/:lon/lat/:lat", (req, res) => {
  const { lon, lat } = req.params;
  const threshold = 1;
  const finalResult = {};

  let hoodmapsTags = [];
  let censusData = {};

  const hoodmapQuery = `SELECT a.*, (
                                3959 * acos (
                                    cos ( radians(${lat}) )
                                    * cos( radians( a.latitude ) )
                                    * cos( radians( a.longitude ) - radians(${lon}) )
                                    + sin ( radians(${lat}) )
                                    * sin( radians( a.latitude ) )
                                ) )
                            AS distance
                            From hoodmaps a
                            HAVING distance < 0.2`;

  conn.query(hoodmapQuery, async (err, hoodmapsResult) => {
    if (err) throw err;
    // console.log("Result: " + result.length);
    hoodmapsResult.forEach(line => hoodmapsTags.push(line));
    finalResult.hoodmaps = hoodmapsTags;

    const response = await axios.get(`https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&showall=true&format=json`);
    if (response && response.data) {
      const { data: { Block: { FIPS } } } = response;
      const censusQuery = `SELECT a.* from census a WHERE a.tract LIKE '%${FIPS.length > 11 ? FIPS.substr(0,11) : FIPS}%'`;
      console.log(censusQuery);
      conn.query(censusQuery, function(err, censusResult) {
        if (!err) {
          console.log(censusResult);
          censusData = censusResult[0];
        }
        finalResult.censusData = censusData;
        res.send(finalResult);
      });
    }
  });
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
