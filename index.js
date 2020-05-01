const express = require("express");
const mysql = require("mysql");
const axios = require("axios");
const cors = require("cors");
const conf = require("dotenv").config();
const app = express();
const sharp = require("sharp");
const path = require("path");
const multer = require("multer");
const PORT = process.env.PORT || 5000;
const dbConfig = require("./config/config.js");

const conn = mysql.createConnection(dbConfig);

conn.connect(function(err) {
  if (err) throw err;
  console.log("DB Connected!");
});
app.use(express.static(`${process.env.BASE_PATH}public`));
app.use(cors());
app.all("*", (request, response, next) => {
  console.log("\n--------------------------------");
  console.log(new Date().toUTCString());
  console.log("Request: ", request.method + " " + request.headers.origin);
  console.log("---");
  console.log("Body", JSON.stringify(request.body));
  console.log("Headers:", JSON.stringify(request.headers));
  console.log("\n--------------------------------\n");
  next();
});

app.use((err, request, response, next) => {
  response.header("Access-Control-Allow-Origin", request.headers.origin);
  response.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
  response.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, X-HTTP-Method-Override, Content-Type, key, Accept"
  );
  response.header("Access-Control-Allow-Credentials", "true");

  if (request.method === "OPTIONS") response.status(200).end();
  next();
});

const randomString = length => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, `${process.env.BASE_PATH}public/images/original`);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      `${randomString(16)}_${Date.now()}${path.extname(file.originalname)}`
    );
  }
});

const upload = multer({ storage: storage }).single("file");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/annotate/lng/:lng/lat/:lat", upload, function(req, res) {
  const formData = req.body;

  const { lng, lat } = req.params;
  const { title, captions, authorName, type, flagged, fileMimeType } = req.body;
  upload(req, res, err => {
    if (err instanceof multer.MulterError) {
      return res.status(500).json(err);
    } else if (err) {
      return res.status(500).json(err);
    }
    const saveFileQuery = `INSERT INTO media_annotations
                              (filename, longitude, latitude, title, captions, authorName, type, fileMimeType, uploaded_on, flagged) 
                              VALUES ('${
                                req.file.filename
                              }', '${lng}', '${lat}', '${title}', '${captions}', '${authorName}', '${type}', '${fileMimeType}', '${Date.now()}', '${flagged}')
                             `;
    conn.query(saveFileQuery, async (err, imageSaveResult) => {
      if (type === "images") {
        sharp(`${process.env.BASE_PATH}public/images/original/${req.file.filename}`)
          .resize(100)
          .toFile(`${process.env.BASE_PATH}public/images/resized/${req.file.filename}`)
          .then(() => {
            return res.status(200).send(req.file);
          });
      } else {
        return res.status(200).send(req.file);
      }
    });
  });
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

app.get(
  "/minlng/:minlng/maxlng/:maxlng/minlat/:minlat/maxlat/:maxlat",
  (req, res) => {
    const { minlng, maxlng, minlat, maxlat } = req.params;
    const threshold = 1;
    const finalResult = {};

    let hoodmapsTags = [];
    let images = [];
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

      const imageQuery = `SELECT b.*
                            From media_annotations b
                            WHERE b.longitude > ${minlng} 
                            AND b.longitude < ${maxlng}
                            AND b.latitude >  ${minlat}
                            AND b.latitude < ${maxlat}`;
      conn.query(imageQuery, async (err, imageResult) => {
        if (err) throw err;
        // console.log("Result: " + result.length);
        imageResult.forEach(line => images.push(line));
        finalResult.images = images;

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
  }
);

app.listen(PORT, () =>
  console.log(`City Data Stories listening on port ${PORT}!`)
);
