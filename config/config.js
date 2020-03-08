module.exports = {
  host: process.env.DB_HOST || process.env.CLEARDB_DATABASE_URL || "localhost",
  user: process.env.DB_USER || process.env.CLEARDB_DATABASE_USER || "root",
  password: process.env.DB_PASS ||process.env.CLEARDB_DATABASE_PASS ||  "root",
  database: process.env.DB_NAME || process.env.CLEARDB_DATABASE_NAME || "myDB"
}
