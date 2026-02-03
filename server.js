const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(helmet()); // Set security headers
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
    fontSrc: ['fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"]
  }
}));

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // General API rate limit
  standardHeaders: true,
  legacyHeaders: false,
});

// Configuration
const ALLOWED_EMAILS = require('./config/emails.json').emails;
const SESSIONS_FILE = './data/sessions.json';
const CONTENT_FILE = './data/content.json';
const LOGIN_LINKS_FILE = './data/login_links.json';
const TOKEN_LENGTH = 32; // bytes for crypto tokens
const MAX_CONTENT_LENGTH = 10000; // Max characters for content
const SESSION_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOGIN_LINK_EXPIRY = 15 * 60 * 1000; // 15 minutes

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
app.use(apiLimiter); // Apply general rate limiting

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token || !isValidToken(token)) {
    return res.status(401).json({ error: 'Invalid or missing token' });
  }
  
  const sessions = getSessions();
  if (!sessions[token] || sessions[token].expires <= Date.now()) {
    return res.status(401).json({ error: 'Token expired' });
  }
  
  req.user = sessions[token];
  next();
}

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
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

function isValidToken(token) {
  // Token should be a 64 character hex string (32 bytes)
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
}

function sanitizeContent(content) {
  if (typeof content !== 'string') return '';
  if (content.length > MAX_CONTENT_LENGTH) {
    content = content.substring(0, MAX_CONTENT_LENGTH);
  }
  // Remove all HTML tags, keep only plain text
  return content.replace(/<[^>]*>/g, '').trim();
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
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token || !isValidToken(token)) {
    return res.json({ logged: false });
  }
  
  const sessions = getSessions();
  if (sessions[token] && sessions[token].expires > Date.now()) {
    res.json({ logged: true, email: sessions[token].email });
  } else {
    res.json({ logged: false });
  }
});

// Login - request link (with rate limiting)
app.post('/api/auth/request-link', loginLimiter, async (req, res) => {
  const { email } = req.body;
  
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Invalid email' });
  }
  
  const trimmedEmail = email.trim().toLowerCase();
  
  if (!ALLOWED_EMAILS.includes(trimmedEmail)) {
    // Don't reveal if email exists (security)
    return res.json({ success: true, message: 'If email is authorized, link sent' });
  }
  
  const token = generateToken();
  const links = getLoginLinks();
  
  // Store token with expiration
  links[token] = {
    email: trimmedEmail,
    expires: Date.now() + LOGIN_LINK_EXPIRY,
    attempts: 0
  };
  saveLoginLinks(links);
  
  // Send email
  const emailSent = await sendLoginEmail(trimmedEmail, token);
  
  if (emailSent) {
    res.json({ success: true, message: 'If email is authorized, link sent' });
  } else {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Verify login link
app.get('/auth/verify', (req, res) => {
  const { token } = req.query;
  
  if (!token || !isValidToken(token)) {
    return res.status(400).send('Invalid token format');
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
    expires: Date.now() + SESSION_EXPIRY
  };
  saveSessions(sessions);
  
  // Delete used link
  delete links[token];
  saveLoginLinks(links);
  
  // Use proper HTML escaping and CSP-safe approach
  const encodedToken = sessionToken.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Login Successful</title>
        <meta charset="UTF-8">
      </head>
      <body>
        <h2>Login Successful!</h2>
        <p>Redirecting...</p>
        <script nonce="${crypto.randomBytes(16).toString('base64')}">
          (function() {
            var token = '${encodedToken}';
            localStorage.setItem('cms-token', token);
            window.location.href = '/';
          })();
        </script>
      </body>
    </html>
  `);
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token && isValidToken(token)) {
    const sessions = getSessions();
    delete sessions[token];
    saveSessions(sessions);
  }
  res.json({ success: true });
});

// Save content (with auth middleware)
app.post('/api/content/save', authenticateToken, (req, res) => {
  const { selector, content } = req.body;
  
  if (!selector || typeof selector !== 'string' || !content) {
    return res.status(400).json({ error: 'Invalid selector or content' });
  }
  
  // Validate selector format (prevent path traversal)
  if (!/^[a-zA-Z0-9_-]+$/.test(selector)) {
    return res.status(400).json({ error: 'Invalid selector format' });
  }
  
  // Sanitize content to prevent XSS
  const sanitized = sanitizeContent(content);
  const data = getContent();
  data[selector] = sanitized;
  saveContent(data);
  
  res.json({ success: true });
});

// Get content
app.get('/api/content', (req, res) => {
  const data = getContent();
  res.json(data);
});

// Upload image (with auth middleware)
app.post('/api/upload/image', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({ 
    success: true, 
    url: `/images/${req.file.filename}` 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(413).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: 'File upload error' });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`CMS Server running on http://localhost:${PORT}`);
});

