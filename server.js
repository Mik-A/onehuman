const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const ALLOWED_EMAILS = require('./config/emails.json').emails;
const SESSIONS_FILE = './data/sessions.json';
const CONTENT_FILE = './data/content.json';

// Ensure required directories exist
['data', 'public/images'].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Initialize files
if (!fs.existsSync(SESSIONS_FILE)) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify({}));
}
if (!fs.existsSync(CONTENT_FILE)) {
  fs.writeFileSync(CONTENT_FILE, JSON.stringify({}));
}

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Multer setup for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/images');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Helper functions
function getSessions() {
  return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
}

function saveSessions(sessions) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function getContent() {
  return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
}

function saveContent(content) {
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Routes

// Check if logged in
app.get('/api/auth/check', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.json({ logged: false });
  
  const sessions = getSessions();
  if (sessions[token] && sessions[token].expires > Date.now()) {
    res.json({ logged: true, email: sessions[token].email });
  } else {
    res.json({ logged: false });
  }
});

// Login - request token
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  
  if (!email || !ALLOWED_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Email not whitelisted' });
  }
  
  const token = generateToken();
  const sessions = getSessions();
  sessions[token] = {
    email,
    expires: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
  };
  saveSessions(sessions);
  
  res.json({ 
    success: true, 
    token,
    message: 'Login successful. Token created.' 
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    const sessions = getSessions();
    delete sessions[token];
    saveSessions(sessions);
  }
  res.json({ success: true });
});

// Save content
app.post('/api/content/save', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const sessions = getSessions();
  
  if (!token || !sessions[token] || sessions[token].expires <= Date.now()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { selector, content } = req.body;
  const data = getContent();
  
  if (!data[selector]) {
    data[selector] = [];
  }
  data[selector] = content;
  saveContent(data);
  
  res.json({ success: true });
});

// Get content
app.get('/api/content', (req, res) => {
  const data = getContent();
  res.json(data);
});

// Upload image
app.post('/api/upload/image', upload.single('image'), (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const sessions = getSessions();
  
  if (!token || !sessions[token] || sessions[token].expires <= Date.now()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({ 
    success: true, 
    url: `/images/${req.file.filename}` 
  });
});

// Main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CMS Server running on http://localhost:${PORT}`);
});
