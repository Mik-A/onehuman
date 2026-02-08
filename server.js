import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import ejs from 'ejs'
import {
  createPost,
  editPost,
  claimPost,
  getPostsForDay,
  getPost,
  todayKey,
  purgeOldPosts,
} from './db.js'
import { startBot, onHumanActivity } from './bot.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// --- View engine (EJS rendering .html files) ---
app.engine('html', ejs.renderFile)
app.set('view engine', 'html')
app.set('views', join(__dirname, 'views'))

// --- Security ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}))

// --- Compression ---
app.use(compression())

// --- Static files ---
app.use(express.static(join(__dirname, 'public')))

// --- Body parsing ---
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// --- Rate limiters (per fingerprint) ---
const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req) => req.headers['x-fingerprint'] || req.ip,
  message: '<p class="error">Too many posts. Try again later.</p>',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
})

const editLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => req.headers['x-fingerprint'] || req.ip,
  message: '<p class="error">Too many edits. Try again later.</p>',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
})

// --- SSE client management ---
const sseClients = new Map()

function broadcast(event, html, dayKey = '') {
  // Wrap html + dayKey as JSON so client can read both
  const payload = JSON.stringify({ html, dayKey })
  for (const [, res] of sseClients) {
    res.write(`event: ${event}\ndata: ${payload}\n\n`)
  }
}

// --- Proof-of-Work ---
const powChallenges = new Map()
const POW_DIFFICULTY = 4
const POW_TARGET = '0'.repeat(POW_DIFFICULTY)
const POW_TTL = 5 * 60 * 1000 // 5 minutes

function verifyPoW(prefix, nonce) {
  if (!powChallenges.has(prefix)) return false
  const hash = createHash('sha256').update(prefix + nonce).digest('hex')
  const valid = hash.startsWith(POW_TARGET)
  if (valid) powChallenges.delete(prefix)
  return valid
}

// Clean expired challenges every minute
setInterval(() => {
  const now = Date.now()
  for (const [prefix, created] of powChallenges) {
    if (now - created > POW_TTL) powChallenges.delete(prefix)
  }
}, 60 * 1000)

// --- Helpers ---

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function relativeTime(dateStr) {
  const now = new Date()
  const date = new Date(dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`)
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function getWeekDays() {
  const now = new Date()
  const utcDay = now.getUTCDay() // 0=Sun … 6=Sat
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - ((utcDay + 6) % 7))

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const today = todayKey()

  // Compute yesterday's key
  const yesterdayDate = new Date(now)
  yesterdayDate.setUTCDate(now.getUTCDate() - 1)
  const yesterday = yesterdayDate.toISOString().split('T')[0]

  const days = []

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    days.push({
      name: dayNames[i],
      date: d.getUTCDate(),
      dateStr,
      isToday: dateStr === today,
      isYesterday: dateStr === yesterday,
    })
  }

  return { days, today }
}

async function renderCard(post, isLatest = false) {
  return ejs.renderFile(
    join(__dirname, 'views', 'partials', 'card.html'),
    { post, relativeTime, isLatest },
  )
}

// =====================================================================
//  ROUTES
// =====================================================================

// --- Main page ---
app.get('/', (req, res) => {
  const { days, today } = getWeekDays()
  const posts = getPostsForDay(today)
  res.render('index', { days, today, posts, relativeTime })
})

// --- Day grid (HTMX partial) ---
app.get('/day/:date', (req, res) => {
  const { date } = req.params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).send('<p class="error">Invalid date format</p>')
  }
  const posts = getPostsForDay(date)
  res.render('partials/grid', { posts, relativeTime })
})

// --- Post form (HTMX partial) ---
app.get('/post-form', (req, res) => {
  res.render('partials/post-form')
})

// --- Create post ---
app.post('/post', postLimiter, async (req, res) => {
  const { topic, body, fingerprint, day_key, pow_prefix, pow_nonce } = req.body

  // Verify proof-of-work
  if (!pow_prefix || pow_nonce === undefined || !verifyPoW(pow_prefix, String(pow_nonce))) {
    return res.status(422).send('<p class="error">Invalid proof of work. Please try again.</p>')
  }

  // Validate fields
  if (!topic?.trim() || !body?.trim()) {
    return res.status(422).send('<p class="error">Topic and body are required.</p>')
  }
  if (topic.length > 60) {
    return res.status(422).send('<p class="error">Topic must be 60 characters or less.</p>')
  }
  if (body.length > 180) {
    return res.status(422).send('<p class="error">Body must be 180 characters or less.</p>')
  }

  // Use the active day from the client, fall back to today
  let dayKey = todayKey()
  if (day_key && /^\d{4}-\d{2}-\d{2}$/.test(day_key)) {
    // Validate day_key is within the 7-day window
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - 7)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    if (day_key >= cutoffStr && day_key <= todayKey()) {
      dayKey = day_key
    }
  }

  // Track human activity for the bot
  if (fingerprint) onHumanActivity()

  const post = createPost({
    topic: topic.trim(),
    body: body.trim(),
    fingerprint: fingerprint || null,
    dayKey,
  })

  const html = await renderCard(post)
  broadcast('new-post', html, post.day_key)
  res.send(html)
})

// --- Single card (for cancel / refresh) ---
app.get('/post/:id/card', async (req, res) => {
  const post = getPost(req.params.id)
  if (!post) return res.status(404).send('<p class="error">Post not found</p>')
  const html = await renderCard(post)
  res.send(html)
})

// --- Edit form (HTMX partial) ---
app.get('/post/:id/edit-form', (req, res) => {
  const post = getPost(req.params.id)
  if (!post) return res.status(404).send('<p class="error">Post not found</p>')
  res.render('partials/edit-form', { post })
})

// --- Edit unclaimed post ---
app.put('/post/:id/edit', editLimiter, async (req, res) => {
  const post = getPost(req.params.id)
  if (!post) return res.status(404).send('<p class="error">Post not found</p>')
  if (post.claimed) {
    return res.status(403).send('<p class="error">This post is claimed. Use your PIN to edit.</p>')
  }

  const { topic, body, fingerprint } = req.body
  if (!topic?.trim() || !body?.trim()) {
    return res.status(422).send('<p class="error">Topic and body are required.</p>')
  }
  if (topic.length > 60) return res.status(422).send('<p class="error">Topic too long.</p>')
  if (body.length > 180) return res.status(422).send('<p class="error">Body too long.</p>')
  if (body.trim().length < 20) {
    return res.status(422).send('<p class="error">Body must be at least 20 characters.</p>')
  }

  if (fingerprint) onHumanActivity()

  const updated = editPost(req.params.id, { topic: topic.trim(), body: body.trim() })
  const html = await renderCard(updated)
  broadcast('edit-post', html, updated.day_key)
  res.send(html)
})

// --- Claim form (HTMX partial) ---
app.get('/post/:id/claim-form', (req, res) => {
  const post = getPost(req.params.id)
  if (!post) return res.status(404).send('<p class="error">Post not found</p>')
  if (post.claimed) return res.status(400).send('<p class="error">Already claimed</p>')
  res.render('partials/claim-modal', { post })
})

// --- Claim post (set PIN) ---
app.post('/post/:id/claim', async (req, res) => {
  const post = getPost(req.params.id)
  if (!post) return res.status(404).send('<p class="error">Post not found</p>')
  if (post.claimed) return res.status(400).send('<p class="error">Already claimed</p>')

  const { pin } = req.body
  if (!pin || pin.length < 4 || pin.length > 8) {
    return res.status(422).send('<p class="error">PIN must be 4–8 characters.</p>')
  }

  const hash = await bcrypt.hash(pin, 10)
  const updated = claimPost(req.params.id, hash)
  const html = await renderCard(updated)
  broadcast('edit-post', html, updated.day_key)
  res.send(html)
})

// --- Edit claimed post (requires PIN) ---
app.put('/post/:id/claimed-edit', editLimiter, async (req, res) => {
  const post = getPost(req.params.id)
  if (!post) return res.status(404).send('<p class="error">Post not found</p>')
  if (!post.claimed) return res.status(400).send('<p class="error">Post is not claimed</p>')

  const { pin, topic, body } = req.body
  if (!pin) return res.status(422).send('<p class="error">PIN required</p>')

  const match = await bcrypt.compare(pin, post.claim_hash)
  if (!match) return res.status(403).send('<p class="error">Wrong PIN</p>')

  if (!topic?.trim() || !body?.trim()) {
    return res.status(422).send('<p class="error">Topic and body are required.</p>')
  }
  if (topic.length > 60) return res.status(422).send('<p class="error">Topic too long.</p>')
  if (body.length > 180) return res.status(422).send('<p class="error">Body too long.</p>')
  if (body.trim().length < 20) {
    return res.status(422).send('<p class="error">Body must be at least 20 characters.</p>')
  }

  const updated = editPost(req.params.id, { topic: topic.trim(), body: body.trim() })
  const html = await renderCard(updated)
  broadcast('edit-post', html, updated.day_key)
  res.send(html)
})

// --- Origin reveal ---
app.get('/post/:id/origin', (req, res) => {
  const post = getPost(req.params.id)
  if (!post) return res.status(404).send('<p class="error">Post not found</p>')

  if (post.edit_count === 0) {
    return res.send('<p class="origin__text">This is the original version.</p>')
  }

  res.send(`
    <div class="origin__content">
      <p class="origin__label">Original:</p>
      <h4 class="origin__topic">${escapeHtml(post.original_topic)}</h4>
      <p class="origin__body">${escapeHtml(post.original_body)}</p>
    </div>
  `)
})

// --- PoW challenge ---
app.get('/pow-challenge', (req, res) => {
  const prefix = randomBytes(16).toString('hex')
  powChallenges.set(prefix, Date.now())
  res.json({ prefix, difficulty: POW_DIFFICULTY })
})

// --- SSE stream ---
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const clientId = Date.now() + Math.random()
  sseClients.set(clientId, res)

  // Keep-alive every 30 s
  const keepalive = setInterval(() => {
    res.write(':keepalive\n\n')
  }, 30000)

  req.on('close', () => {
    clearInterval(keepalive)
    sseClients.delete(clientId)
  })
})

// =====================================================================
//  ARCHIVE CLEANUP
// =====================================================================
function archiveCleanup() {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - 7)
  const cutoffKey = cutoff.toISOString().split('T')[0]
  const result = purgeOldPosts(cutoffKey)
  if (result.changes > 0) {
    console.log(`[ARCHIVE] Deleted ${result.changes} posts older than ${cutoffKey}`)
  }
}

setInterval(archiveCleanup, 60 * 60 * 1000) // hourly
archiveCleanup() // run on startup

// =====================================================================
//  START
// =====================================================================
app.listen(PORT, () => {
  console.log(`The Wall running on http://localhost:${PORT}`)
  startBot({ broadcast, renderCard })
})
