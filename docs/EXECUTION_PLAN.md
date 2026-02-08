# THE WALL — Execution Plan

## Concept Summary
Single global anonymous text wall. Grid of cards. Anyone can post, anyone can edit unclaimed posts. Posts live on a 7-day rolling calendar (Mon–Sun). No accounts. No moderation. Origin + current + edit count traces. Claiming locks a post via PIN.

## Stack
- **Runtime:** Node.js (Express)
- **Frontend:** HTMX + minimal vanilla JS + SSE for real-time
- **Database:** SQLite (via better-sqlite3)
- **Templating:** EJS or plain HTML partials
- **Deployment:** Single VPS (Hetzner), Caddy reverse proxy

## Architecture: Single HTML-ish app
All in one repo. No build step. No bundler. Server renders HTML fragments, HTMX swaps them in.

```
thewall/
├── server.js              # Express app, all routes
├── db.js                  # SQLite setup + queries
├── bot.js                 # Heartbeat bot logic
├── package.json
├── public/
│   ├── style.css          # All styles
│   ├── app.js             # Minimal client JS (SSE, fingerprint, captcha)
│   └── favicon.ico
├── views/
│   ├── index.html         # Main page shell
│   ├── partials/
│   │   ├── card.html      # Single post card
│   │   ├── grid.html      # Card grid container
│   │   ├── post-form.html # New post form
│   │   ├── edit-form.html # Inline edit form
│   │   ├── claim-modal.html
│   │   └── day-nav.html   # Mon-Sun calendar nav
│   └── archive.html       # Read-only older-than-7-days view (v1.1)
├── seeds/
│   └── seed-posts.json    # 10-30 pre-generated posts
├── thewall.db             # SQLite file (gitignored)
└── README.md
```

---

## Phase 1: Database + Core API (Day 1)

### 1.1 SQLite Schema

```sql
CREATE TABLE posts (
  id TEXT PRIMARY KEY,           -- nanoid
  topic TEXT NOT NULL,            -- header/title, max 60 chars
  body TEXT NOT NULL,             -- max 180 chars
  original_topic TEXT NOT NULL,   -- frozen first version
  original_body TEXT NOT NULL,    -- frozen first version
  edit_count INTEGER DEFAULT 0,
  claimed INTEGER DEFAULT 0,      -- 0 = editable by anyone, 1 = locked
  claim_hash TEXT,                -- bcrypt hash of claim PIN
  fingerprint TEXT,               -- browser fingerprint of original poster
  language TEXT,                  -- auto-detected ISO 639-1 (v1.1)
  day_key TEXT NOT NULL,          -- 'YYYY-MM-DD' for calendar grouping
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_posts_day ON posts(day_key, created_at DESC);
CREATE INDEX idx_posts_updated ON posts(updated_at DESC);
```

### 1.2 API Routes

All routes return HTML fragments (HTMX responses), not JSON.

| Method | Route | Purpose | Returns |
|--------|-------|---------|---------|
| GET | `/` | Main page with today's grid | Full page |
| GET | `/day/:date` | Grid for specific day | Grid partial (HTMX swap) |
| POST | `/post` | Create new post | New card partial + SSE broadcast |
| PUT | `/post/:id/edit` | Edit unclaimed post | Updated card partial + SSE broadcast |
| POST | `/post/:id/claim` | Claim a post (set PIN) | Updated card partial |
| PUT | `/post/:id/claimed-edit` | Edit own claimed post (requires PIN) | Updated card partial |
| GET | `/post/:id/edit-form` | Get inline edit form | Edit form partial |
| GET | `/post/:id/origin` | Get original version (expand) | Origin text partial |
| GET | `/stream` | SSE endpoint | Event stream |

### 1.3 Anti-bot Layer

**Implement in this order:**
1. **Rate limiting** per fingerprint (FingerprintJS free tier or simple canvas fingerprint):
   - Posts: 3/hour per fingerprint
   - Edits: 10/hour per fingerprint
   - Use express-rate-limit with a custom key generator
2. **Proof-of-work on post creation:**
   - Server sends a challenge (random prefix)
   - Client must find a nonce where SHA-256(prefix + nonce) starts with 4 zeros
   - Takes browser ~1-2 seconds, makes bot flooding expensive
   - Implement in `public/app.js` — show brief "thinking..." animation
3. **Cloudflare Turnstile** on post creation only (free, invisible CAPTCHA)
   - Editing stays frictionless — no CAPTCHA
   - Add as middleware on POST `/post` route

---

## Phase 2: Frontend + HTMX (Day 2)

### 2.1 Main Page Structure

```html
<!-- index.html -->
<body class="dark">
  <!-- Day navigation: Mon Tue Wed Thu Fri Sat Sun -->
  <nav id="day-nav">
    <!-- 7 day pills, today highlighted, each triggers hx-get="/day/YYYY-MM-DD" -->
  </nav>

  <!-- Post button (FAB, bottom-right on mobile) -->
  <button id="new-post-fab" hx-get="/post-form" hx-target="#modal" hx-swap="innerHTML">+</button>

  <!-- Grid -->
  <div id="grid" class="masonry">
    <!-- Cards injected here -->
  </div>

  <!-- Modal container -->
  <div id="modal"></div>
</body>
```

### 2.2 Card Component

```html
<!-- card.html partial -->
<article class="card {{#if claimed}}card--claimed{{/if}}" id="post-{{id}}">
  <h3 class="card__topic">{{topic}}</h3>
  <p class="card__body">{{body}}</p>
  <footer class="card__meta">
    <span class="card__time">{{relativeTime}}</span>
    <span class="card__edits"
          hx-get="/post/{{id}}/origin"
          hx-target="#origin-{{id}}"
          hx-swap="innerHTML"
          title="Show original">
      ✏️ {{edit_count}}
    </span>
    {{#if claimed}}
      <span class="card__lock">🔒</span>
    {{else}}
      <button hx-get="/post/{{id}}/edit-form"
              hx-target="#post-{{id}}"
              hx-swap="outerHTML"
              class="card__edit-btn">Edit</button>
      <button hx-get="/post/{{id}}/claim-form"
              hx-target="#modal"
              hx-swap="innerHTML"
              class="card__claim-btn">Claim</button>
    {{/if}}
  </footer>
  <!-- Origin reveal zone -->
  <div id="origin-{{id}}" class="card__origin"></div>
</article>
```

### 2.3 Styling Direction

- **Dark mode default:** `#1a1a2e` background, `#e0e0e0` text
- **Accent:** Teal `#00d2d3` for interactive elements
- **Claimed card border:** Gold `#f9ca24` solid
- **Unclaimed card border:** Subtle dotted `#444`
- **Font:** System font stack, monospace for edit counts
- **Masonry grid:** CSS columns (no JS library needed)
  - Mobile: 1 column
  - Tablet: 2 columns
  - Desktop: 3 columns
- **Card animation:** Fade-in on new posts, subtle pulse on edit
- **FAB:** Fixed bottom-right, 56px circle, teal background
- **Day nav:** Horizontal pill bar, sticky top, today = teal fill, past days = outline

### 2.4 Real-time Updates (SSE)

```javascript
// server.js - SSE endpoint
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const clientId = Date.now();
  clients.set(clientId, res);
  req.on('close', () => clients.delete(clientId));
});

// Broadcast function
function broadcast(event, html) {
  for (const [id, res] of clients) {
    res.write(`event: ${event}\ndata: ${html}\n\n`);
  }
}
```

```javascript
// public/app.js - Client SSE listener
const evtSource = new EventSource('/stream');

evtSource.addEventListener('new-post', (e) => {
  const grid = document.getElementById('grid');
  grid.insertAdjacentHTML('afterbegin', e.data);
});

evtSource.addEventListener('edit-post', (e) => {
  // Parse post ID from data, swap card via HTMX
  const temp = document.createElement('div');
  temp.innerHTML = e.data;
  const newCard = temp.firstElementChild;
  const oldCard = document.getElementById(newCard.id);
  if (oldCard) oldCard.replaceWith(newCard);
});
```

---

## Phase 3: Core Interactions (Day 3)

### 3.1 Post Creation Flow

1. User taps FAB → modal with form appears
2. Form fields: Topic (60 char max), Body (180 char max), live char counter
3. On submit: client solves proof-of-work → Turnstile token attached → POST `/post`
4. Server validates PoW + Turnstile + rate limit → creates post → broadcasts SSE
5. Modal closes, new card appears at grid top with fade-in

### 3.2 Edit Flow

1. User taps "Edit" on unclaimed card → card transforms into inline edit form (HTMX swap)
2. Edit form shows current topic + body in editable fields, char counters
3. Submit → PUT `/post/:id/edit` with fingerprint
4. Server: check not claimed, rate limit OK → update body + increment edit_count + update updated_at
5. Broadcast updated card via SSE to all viewers
6. **Constraint:** edits cannot reduce body below 20 characters (anti-blanking)

### 3.3 Claim Flow

1. User taps "Claim" → modal with PIN input (4-8 chars)
2. Submit → POST `/post/:id/claim`
3. Server: bcrypt hash PIN, set claimed=1, store hash
4. Card transforms: dotted border → solid gold, lock icon appears, Edit/Claim buttons removed
5. Claimed post owner can still edit via "Edit (mine)" button that asks for PIN first

### 3.4 Origin Reveal

1. User taps edit count `✏️ 12` → HTMX GET `/post/:id/origin`
2. Returns small HTML block showing original_topic + original_body in faded/struck style
3. Toggles on re-tap (client-side class toggle)

---

## Phase 4: Calendar System (Day 4)

### 4.1 Day Navigation

- Sticky top bar with 7 pills: Mon, Tue, Wed, Thu, Fri, Sat, Sun
- Each pill shows the date below the day name
- Today is highlighted (teal fill)
- Past days are clickable, load that day's grid via `hx-get="/day/YYYY-MM-DD"` → swaps `#grid`
- Days older than 7 days are not shown (archived)

### 4.2 Day Rollover Logic

```javascript
// Cron job or setInterval - runs at midnight UTC (or server timezone)
function archiveOldPosts() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffKey = cutoff.toISOString().split('T')[0];

  // Option A: Delete permanently
  db.prepare('DELETE FROM posts WHERE day_key < ?').run(cutoffKey);

  // Option B: Move to archive table (v1.1)
  // db.prepare('INSERT INTO archive SELECT * FROM posts WHERE day_key < ?').run(cutoffKey);
  // db.prepare('DELETE FROM posts WHERE day_key < ?').run(cutoffKey);
}
```

### 4.3 Day Assignment

Posts get `day_key` based on UTC date at creation time. This ensures global consistency — "Tuesday's wall" is the same wall for everyone. Display local day names in the nav using client-side JS.

---

## Phase 5: Heartbeat Bot (Day 5)

### 5.1 Bot Logic

```javascript
// bot.js
const INACTIVITY_THRESHOLD = 60 * 60 * 1000; // 1 hour
const MIN_INTERVAL = 45 * 60 * 1000;          // 45 min
const MAX_INTERVAL = 90 * 60 * 1000;          // 90 min
let lastHumanActivity = Date.now();
let botSleeping = true;

function onHumanActivity() {
  lastHumanActivity = Date.now();
  botSleeping = true; // Immediately sleep on human activity
}

async function botLoop() {
  while (true) {
    const idle = Date.now() - lastHumanActivity;

    if (idle > INACTIVITY_THRESHOLD && botSleeping) {
      botSleeping = false;
    }

    if (!botSleeping) {
      // Randomly choose: create new post OR edit existing unclaimed post
      if (Math.random() < 0.4) {
        await botCreatePost();
      } else {
        await botEditRandomPost();
      }

      // Check again if human appeared during our action
      if (Date.now() - lastHumanActivity < INACTIVITY_THRESHOLD) {
        botSleeping = true;
      }
    }

    const wait = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
    await sleep(wait);
  }
}
```

### 5.2 Bot Content

- Load seed posts from `seeds/seed-posts.json`
- Bot posts are half-thoughts, provocations, observations
- Bot edits should slightly transform existing unclaimed posts (add a word, rephrase, extend)
- Bot never claims posts
- Bot content should be multilingual (seed file includes EN, FI, DE, ES, JA, AR entries)
- Bot posts use a null fingerprint and bypass rate limits internally

### 5.3 Bot Kill Switch Rules

- Sleep immediately on ANY human post or edit (detected by non-null fingerprint)
- Never exceed 5% of daily content (track with a counter)
- Never post more than 3 cards per wake cycle
- Log all bot activity for debugging (but don't expose)

---

## Phase 6: Polish + Mobile (Day 6)

### 6.1 Mobile-First Priorities

- All primary actions in bottom 40% thumb zone
- FAB bottom-right (56px)
- Swipe gestures: swipe left on card reveals Edit/Claim (optional, stretch goal)
- Bottom sheet modals instead of centered modals on mobile
- Touch targets minimum 44px
- No horizontal scroll ever
- Day nav: horizontally scrollable if needed on small screens

### 6.2 Performance

- Lazy load cards below fold (HTMX `hx-trigger="revealed"`)
- Limit initial grid to 50 posts, "Load more" at bottom
- SSE with auto-reconnect
- SQLite WAL mode for concurrent reads
- Gzip all responses

### 6.3 Fingerprinting

Use a lightweight canvas + WebGL fingerprint (no library dependency). Store in localStorage. This is NOT for security — it's for rate limiting and "is this my post?" convenience only.

```javascript
// public/app.js
function getFingerprint() {
  let fp = localStorage.getItem('wall_fp');
  if (fp) return fp;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('wall-fp', 2, 2);
  fp = canvas.toDataURL().slice(-32);
  localStorage.setItem('wall_fp', fp);
  return fp;
}
```

---

## Phase 7: Deployment (Day 6-7)

### 7.1 Server Setup

```bash
# Hetzner VPS, Ubuntu 24
apt update && apt install -y nodejs npm caddy
npm install -g pm2

# Clone and install
git clone <repo> /opt/thewall
cd /opt/thewall && npm install

# Start with PM2
pm2 start server.js --name thewall
pm2 save && pm2 startup
```

### 7.2 Caddy Config

```
thewall.app {
  reverse_proxy localhost:3000
  encode gzip
}
```

### 7.3 SQLite Backup

```bash
# Cron: daily backup
0 3 * * * sqlite3 /opt/thewall/thewall.db ".backup /opt/backups/thewall-$(date +\%Y\%m\%d).db"
```

---

## NPM Dependencies

```json
{
  "dependencies": {
    "express": "^4.18",
    "better-sqlite3": "^11",
    "nanoid": "^5",
    "bcrypt": "^5",
    "ejs": "^3",
    "helmet": "^7",
    "express-rate-limit": "^7",
    "compression": "^1"
  },
  "devDependencies": {
    "nodemon": "^3"
  }
}
```

---

## Implementation Order (Strict)

1. **Database schema + db.js** — tables, indexes, query functions
2. **server.js skeleton** — Express + routes returning dummy HTML
3. **index.html + style.css** — page shell, grid layout, dark mode, card styles
4. **POST /post + card partial** — create posts, render cards
5. **SSE stream** — real-time card injection
6. **PUT /post/:id/edit** — edit flow with anti-blank + rate limit
7. **POST /post/:id/claim** — claim flow with PIN hash
8. **Day navigation** — calendar bar + day-filtered queries
9. **Origin reveal** — tap edit count to see original
10. **Proof-of-work + Turnstile** — anti-bot layer
11. **Heartbeat bot** — seed content + idle detection
12. **Mobile polish** — thumb zones, animations, bottom sheets
13. **Deploy** — Caddy + PM2 + backups

---

## What's NOT in MVP (v1.1+)

- Sub-threads / card expand
- Language detection + filter chips
- Translation button
- Reactions (🔥)
- Archive browsing (older than 7 days)
- Sponsored/brand posts
- API access
- White-label / embeddable
- Analytics dashboard
- PWA / offline support
