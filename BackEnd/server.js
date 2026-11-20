const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('./db'); // connect to Neon

const app = express();

app.use(express.json({ limit: '3mb' }));

if (require.main === module) {
  app.use(express.static(path.join(__dirname, '..')));
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'HTML', 'index.html'));
  });
}

let dbInitialization;
function ensureDbInitialized() {
  if (!process.env.DATABASE_URL) {
    return Promise.reject(new Error('DATABASE_URL is required'));
  }
  if (!dbInitialization) {
    dbInitialization = initDb();
  }
  return dbInitialization;
}

app.get('/api/health', async (req, res) => {
  try {
    await ensureDbInitialized();
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.use(
  [
    '/api/signup',
    '/api/check-username',
    '/api/check-email',
    '/api/login',
    '/api/update-account',
    '/api/upload-profile-image'
  ],
  (req, res, next) => {
    ensureDbInitialized().then(() => next(), next);
  }
);

/* =========================
   SIGNUP
========================= */
app.post('/api/signup', async (req, res) => {
  let { username, firstName, lastName, email, password } = req.body;

  // basic presence
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password required' });
  }

  // length limits
  if (username.length > 20 || (firstName && firstName.length > 20) || (lastName && lastName.length > 20)) {
    return res.status(400).json({ error: 'Fields cannot exceed 20 characters' });
  }

  // profanity filter (simple list)
  const badWords = ['shit', 'pussy', 'ass', 'dick', 'cunt', 'whore', 'fuck', 'slut', 'nigga', 'nigger', 'motherfucker', 'damn','bitch','asshole','bastard'];
  const checkProfane = str => {
    if (!str) return false;
    const lower = str.toLowerCase();
    return badWords.some(w => new RegExp(`\\b${w}\\b`,`i`).test(lower));
  };
  if (checkProfane(username) || checkProfane(firstName) || checkProfane(lastName)) {
    return res.status(400).json({ error: 'Please avoid using offensive words' });
  }

  // normalize names
  firstName = firstName ? firstName.trim() : '';
  lastName = lastName ? lastName.trim() : '';
  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (firstName) firstName = capitalize(firstName);
  if (lastName) lastName = capitalize(lastName);
  username = username.trim();
  email = email.trim().toLowerCase();

  try {
    // Check username
    const usernameCheck = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (usernameCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Check email
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (username, first_name, last_name, email, password)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username`,
      [username, firstName, lastName, email, hashed]
    );
    console.log('New user created:', result.rows[0]);
    res.json({ success: true, user: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* =========================
   CHECK USERNAME
========================= */
app.get('/api/check-username', async (req, res) => {
  const username = (req.query.username || '').trim();

  if (!username) return res.json({ available: false });

  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    res.json({ available: result.rows.length === 0 });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

/* =========================
   CHECK EMAIL
========================= */
app.get('/api/check-email', async (req, res) => {
  const email = (req.query.email || '').trim();

  if (!email) return res.json({ available: false });

  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    res.json({ available: result.rows.length === 0 });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

/* =========================
   LOGIN
========================= */
app.post('/api/login', async (req, res) => {
  const { email, username, password } = req.body;

  if ((!email && !username) || !password) {
    return res.status(400).json({ error: 'email/username and password required' });
  }

  try {
    let result;
    if (email) {
      console.log('Login attempt with email:', email);
      result = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );
    } else {
      console.log('Login attempt with username:', username);
      result = await pool.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );
    }

    console.log('Query returned', result.rows.length, 'rows');

    if (result.rows.length === 0) {
      console.log('No user found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log('User found:', user.username, user.email);

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      console.log('Password mismatch');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Login successful for:', user.username);
    res.json({
      success: true,
      user: { 
        id: user.id, 
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* =========================
   ACCOUNT UPDATE ENDPOINT
========================= */

// in-memory rate limiting for update attempts
const changeAttempts = {}; // { userId: { count, firstAttempt } }

app.post('/api/update-account', async (req, res) => {
  const { id, field, newValue, currentPassword, currentEmail } = req.body;
  if (!id || !field || newValue == null) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // rate limiting
  const now = Date.now();
  const record = changeAttempts[id] || { count: 0, firstAttempt: now };
  if (record.count >= 5 && now - record.firstAttempt < 3600000) {
    return res.status(429).json({ error: 'Too many attempts. Try again later', retryAfter: 3600000 - (now - record.firstAttempt) });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];

    // verify credentials
    let valid = false;
    if (field === 'email') {
      if (currentEmail && currentPassword) {
        valid = currentEmail.toLowerCase() === user.email.toLowerCase() && await bcrypt.compare(currentPassword, user.password);
      }
    } else if (field === 'password') {
      if (currentEmail && currentPassword) {
        valid = currentEmail.toLowerCase() === user.email.toLowerCase() && await bcrypt.compare(currentPassword, user.password);
      }
    } else {
      // other fields require password only
      valid = currentPassword && await bcrypt.compare(currentPassword, user.password);
    }

    if (!valid) {
      record.count += 1;
      if (record.count === 1) record.firstAttempt = now;
      changeAttempts[id] = record;
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // reset attempts on success
    delete changeAttempts[id];

    // before updating email/username, ensure not already taken
    if (field === 'username' || field === 'email') {
      const col = field === 'username' ? 'username' : 'email';
      const check = await pool.query(
        `SELECT id FROM users WHERE LOWER(${col}) = LOWER($1) AND id <> $2`,
        [newValue, id]
      );
      if (check.rows.length > 0) {
        return res.status(409).json({ error: `${field === 'username' ? 'Username' : 'Email'} already in use` });
      }
    }

    // perform update
    let query, params;
    switch (field) {
      case 'password': {
        const hashed = await bcrypt.hash(newValue, 10);
        query = 'UPDATE users SET password=$1 WHERE id=$2';
        params = [hashed, id];
        break;
      }
      case 'email':
        query = 'UPDATE users SET email=$1 WHERE id=$2';
        params = [newValue, id];
        break;
      case 'username':
        query = 'UPDATE users SET username=$1 WHERE id=$2';
        params = [newValue, id];
        break;
      case 'first_name':
        query = 'UPDATE users SET first_name=$1 WHERE id=$2';
        params = [newValue, id];
        break;
      case 'last_name':
        query = 'UPDATE users SET last_name=$1 WHERE id=$2';
        params = [newValue, id];
        break;
      case 'pin':
        query = 'UPDATE users SET pin=$1 WHERE id=$2';
        params = [newValue, id];
        break;
      default:
        return res.status(400).json({ error: 'Unknown field' });
    }

    await pool.query(query, params);
    return res.json({ success: true, field, newValue });
  } catch (err) {
    console.error('Account update error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   PROFILE IMAGE UPLOAD
========================= */
app.post('/api/upload-profile-image', async (req, res) => {
  const { id, image } = req.body;

  if (!id || !image) {
    return res.status(400).json({ error: 'id and image required' });
  }

  try {
    // Validate base64 image size (base64 is ~4/3 of original byte size)
    // Remove data URI prefix if present
    const imageData = image.startsWith('data:') ? image.split(',')[1] : image;
    const estimatedBytes = (imageData.length * 3) / 4;
    
    if (estimatedBytes > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image exceeds 2 MB limit' });
    }

    // Update user's profile image in database
    await pool.query('UPDATE users SET profile_image=$1 WHERE id=$2', [image, id]);

    // Fetch updated user object
    const result = await pool.query(
      'SELECT id, username, first_name, last_name, email, profile_image FROM users WHERE id=$1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Profile image upload error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   CONTACT FORM
========================= */
app.post('/api/send-contact', async (req, res) => {
  const { fullName, email, message } = req.body;
  const validEmail = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (
    typeof fullName !== 'string' ||
    fullName.trim().length < 3 ||
    fullName.trim().length > 50 ||
    !validEmail ||
    typeof message !== 'string' ||
    message.trim().length < 10 ||
    message.trim().length > 2000
  ) {
    return res.status(400).json({ error: 'Please provide a valid name, email, and message' });
  }

  if (
    !process.env.RESEND_API_KEY ||
    !process.env.CONTACT_FROM_EMAIL ||
    !process.env.CONTACT_TO_EMAIL
  ) {
    return res.status(503).json({ error: 'Contact form is not configured' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM_EMAIL,
        to: [process.env.CONTACT_TO_EMAIL],
        reply_to: email.trim(),
        subject: 'EcoSphere contact form message',
        text: `From: ${fullName.trim()}\nEmail: ${email.trim()}\n\n${message.trim()}`
      })
    });

    if (!response.ok) {
      console.error('Contact email provider returned status:', response.status);
      return res.status(502).json({ error: 'Failed to send message' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Contact email request failed:', err);
    return res.status(502).json({ error: 'Failed to send message' });
  }
});

/* =========================
   NEWS FETCHING - Guardian
========================= */
// Node 18+ provides global fetch; no need for node-fetch import
// if running on an older runtime you could uncomment the following line:
// const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

app.get('/api/news', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = 20;

  if (!process.env.GUARDIAN_API_KEY) {
    return res.status(500).json({ error: 'Guardian API key missing' });
  }

  try {
    // Guardian API base URL - only environment and science sections
    let url = `https://content.guardianapis.com/search?section=environment|science&order-by=newest&page-size=${pageSize}&page=${page}&show-fields=trailText,thumbnail,body&api-key=${process.env.GUARDIAN_API_KEY}`;

    // Optional user search query and category term
    let queryParts = [];
    if (req.query.category) {
      const cat = req.query.category.trim().toLowerCase();
      if (cat && cat !== 'all') {
        queryParts.push(cat);
      }
    }
    if (req.query.q) {
      const term = req.query.q.trim();
      if (term && term.toLowerCase() !== 'all') {
        queryParts.push(term);
      }
    }
    if (queryParts.length > 0) {
      // join with space so Guardian treats as AND
      url += `&q=${encodeURIComponent(queryParts.join(' '))}`;
    }

    // use global fetch
    const resp = await fetch(url);
    const data = await resp.json();

    if (!data.response || !data.response.results) {
      return res.status(500).json({ error: 'Invalid Guardian response' });
    }

    // Strong environmental keywords
    const strongKeywords = [
      "climate", "climate change", "sustainability", "renewable", "pollution",
      "biodiversity", "deforestation", "carbon", "emissions", "microplastics",
      "ocean", "waste", "recycling", "compost", "electric vehicle", "green tech",
      "biogas", "solar", "wind", "vertical farming", "sustainable agriculture"
    ];

    // Exclude unrelated keywords
    const excludeKeywords = ["football", "soccer", "NBA", "celebrity", "movie", "music", "gaming", "fashion"];

    // Filter articles
    const filtered = data.response.results.filter(article => {
      const text = (article.webTitle + " " + (article.fields?.trailText || "")).toLowerCase();
      const hasStrong = strongKeywords.some(word => text.includes(word));
      const hasExcluded = excludeKeywords.some(word => text.includes(word));
      // if the client explicitly requested a specific category (not 'all'),
      // require one of the strong keywords too; otherwise just drop excluded terms.
      if (req.query.category && req.query.category.trim().toLowerCase() !== 'all') {
        return hasStrong && !hasExcluded;
      } else {
        return !hasExcluded;
      }
    });

    // Return clean JSON for frontend
    res.json({
      totalResults: filtered.length,
      articles: filtered.map(a => ({
        id: a.id,
        title: a.webTitle,
        url: a.webUrl,
        thumbnail: a.fields?.thumbnail || null,
        snippet: a.fields?.trailText || null,
        section: a.sectionName,
        date: a.webPublicationDate
      }))
    });

  } catch (err) {
    console.error('Guardian fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch Guardian news' });
  }
});
/* =========================
   START SERVER
========================= */


// ensure users table exists
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      pin TEXT,
      profile_image TEXT
    )
  `);
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS pin TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT');
  console.log('Verified users table and profile columns');
}

app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status && err.status < 500 ? err.status : 503;
  res.status(status).json({
    error: status === 400 ? 'Invalid request body' : 'Service temporarily unavailable'
  });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = app;