const express = require("express");
const mysql = require("mysql");
const axios = require("axios");
var cors = require('cors')
const app = express();
const PORT = process.env.PORT || 5000;
const dbConfig = require("./config/config.js");

const conn = mysql.createConnection(dbConfig);

conn.connect(function(err) {
  if (err) throw err;
  console.log("DB Connected!");
});
app.use(cors());
app.all("*" , (request, response, next) => {
  console.log("\n--------------------------------");
  console.log(new Date().toUTCString());
  console.log("Request: ", request.method + " "+request.headers.origin);
  console.log("---");
  console.log("Body", JSON.stringify(request.body));
  console.log("Headers:", JSON.stringify(request.headers));
  console.log("\n--------------------------------\n");
  next();
});

app.use((err, request, response, next) => {
  response.header("Access-Control-Allow-Origin", request.headers.origin);
  response.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
  response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, X-HTTP-Method-Override, Content-Type, key, Accept");
  response.header("Access-Control-Allow-Credentials", "true");

  if (request.method === 'OPTIONS') response.status(200).end();
  next();
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

/**
 * Given a specific LNG, LAT, Get all annotations within a circle of 0.2 miles radius
 */

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

    const response = await axios.get(
      `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&showall=true&format=json`
    );
    if (response && response.data) {
      const {
        data: {
          Block: { FIPS }
        }
      } = response;
      const censusQuery = `SELECT a.* from census a WHERE a.tract LIKE '%${
        FIPS.length > 11 ? FIPS.substr(0, 11) : FIPS
      }%'`;
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

/**
 * Given a specific LNG, LAT, Get all annotations within a circle of 0.2 miles radius
 */

app.get("/minlng/:minlng/maxlng/:maxlng/minlat/:minlat/maxlat/:maxlat", (req, res) => {
  const { minlng, maxlng, minlat, maxlat } = req.params;
  const threshold = 1;
  const finalResult = {};

  let hoodmapsTags = [];
  let censusData = {};

  const hoodmapQuery = `SELECT a.*
                            From hoodmaps a
                            WHERE a.longitude > ${minlng} 
                            AND a.longitude < ${maxlng}
                            AND a.latitude >  ${minlat}
                            AND a.latitude < ${maxlat}`;

  conn.query(hoodmapQuery, async (err, hoodmapsResult) => {
    if (err) throw err;
    // console.log("Result: " + result.length);
    hoodmapsResult.forEach(line => hoodmapsTags.push(line));
    finalResult.hoodmaps = hoodmapsTags;

    /*const response = await axios.get(
        `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&showall=true&format=json`
    );
    if (response && response.data) {
      const {
        data: {
          Block: { FIPS }
        }
      } = response;
      const censusQuery = `SELECT a.* from census a WHERE a.tract LIKE '%${
          FIPS.length > 11 ? FIPS.substr(0, 11) : FIPS
      }%'`;
      console.log(censusQuery);
      conn.query(censusQuery, function(err, censusResult) {
        if (!err) {
          console.log(censusResult);
          censusData = censusResult[0];
        }
      });
    }*/
    finalResult.censusData = censusData;
    res.send(finalResult);
  });
});

app.listen(PORT, () =>
  console.log(`City Data Stories listening on port ${PORT}!`)
);
