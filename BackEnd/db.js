// db.js
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // required for Neon free tier
  },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 20000,
  max: 5
});

module.exports = pool;