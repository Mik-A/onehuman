const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const ALLOWED_EMAILS = require('./config/emails.json').emails;
const SESSIONS_FILE = './data/sessions.json';
const CONTENT_FILE = './data/content.json';
const LOGIN_LINKS_FILE = './data/login_links.json';

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
});

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
if (!fs.existsSync(LOGIN_LINKS_FILE)) {
  fs.writeFileSync(LOGIN_LINKS_FILE, JSON.stringify({}));
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

function getLoginLinks() {
  return JSON.parse(fs.readFileSync(LOGIN_LINKS_FILE, 'utf8'));
}

function saveLoginLinks(links) {
  fs.writeFileSync(LOGIN_LINKS_FILE, JSON.stringify(links, null, 2));
}

async function sendLoginEmail(email, token) {
  const loginLink = `${process.env.BASE_URL || 'http://localhost:3000'}/auth/verify?token=${token}`;
  
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@onehuman.ai',
      to: email,
      subject: 'Your One Human Login Link',
      html: `
        <h2>Login to One Human</h2>
        <p>Click the link below to log in (valid for 15 minutes):</p>
        <p><a href="${loginLink}" style="background-color: #c54b2a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Login to Dashboard</a></p>
        <p>Or copy this link: <code>${loginLink}</code></p>
        <p>If you didn't request this link, you can safely ignore this email.</p>
      `
    });
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
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

// Login - request link
app.post('/api/auth/request-link', async (req, res) => {
  const { email } = req.body;
  
  if (!email || !ALLOWED_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Email not authorized' });
  }
  
  const token = generateToken();
  const links = getLoginLinks();
  
  // Store token with 15 minute expiration
  links[token] = {
    email,
    expires: Date.now() + (15 * 60 * 1000) // 15 minutes
  };
  saveLoginLinks(links);
  
  // Send email
  const emailSent = await sendLoginEmail(email, token);
  
  if (emailSent) {
    res.json({ success: true, message: 'Login link sent to email' });
  } else {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Verify login link
app.get('/auth/verify', (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).send('No token provided');
  }
  
  const links = getLoginLinks();
  const linkData = links[token];
  
  if (!linkData || linkData.expires <= Date.now()) {
    return res.status(401).send('Link expired or invalid. <a href="/">Try logging in again</a>');
  }
  
  // Create session token
  const sessionToken = generateToken();
  const sessions = getSessions();
  sessions[sessionToken] = {
    email: linkData.email,
    expires: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
  };
  saveSessions(sessions);
  
  // Delete used link
  delete links[token];
  saveLoginLinks(links);
  
  // Redirect to page with token in localStorage
  res.send(`
    <html>
      <body>
        <h2>Login Successful!</h2>
        <p>Logging you in...</p>
        <script>
          localStorage.setItem('cms-token', '${sessionToken}');
          window.location.href = '/';
        </script>
      </body>
    </html>
  `);
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
