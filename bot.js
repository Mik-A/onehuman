import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  createPost,
  editPost,
  getRandomUnclaimedPost,
  todayKey,
  getDayPostCount,
  getBotPostCount,
} from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const INACTIVITY_THRESHOLD = 60 * 60 * 1000 // 1 hour
const MIN_INTERVAL = 45 * 60 * 1000         // 45 min
const MAX_INTERVAL = 90 * 60 * 1000         // 90 min
const MAX_PER_CYCLE = 3
const MAX_DAILY_RATIO = 0.05                // 5% of daily content

let lastHumanActivity = Date.now()
let botSleeping = true
let seeds = []

export function onHumanActivity() {
  lastHumanActivity = Date.now()
  botSleeping = true
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function loadSeeds() {
  const data = await readFile(join(__dirname, 'seeds', 'seed-posts.json'), 'utf8')
  seeds = JSON.parse(data)
}

function randomSeed() {
  return seeds[Math.floor(Math.random() * seeds.length)]
}

const editSuffixes = [
  ' ...and yet',
  ' (someone was here)',
  ' — continued',
  ', perhaps',
  ' ✨',
  ' — or maybe not',
  '. Think about it.',
  ' [edited]',
]

async function botCreatePost(broadcast, renderCard) {
  const seed = randomSeed()
  const post = createPost({
    topic: seed.topic,
    body: seed.body,
    fingerprint: null,
    dayKey: todayKey(),
  })
  const html = await renderCard(post)
  broadcast('new-post', html, post.day_key)
  console.log(`[BOT] Created post: ${post.id} — "${post.topic}"`)
}

async function botEditRandomPost(broadcast, renderCard) {
  const post = getRandomUnclaimedPost()
  if (!post) return

  const suffix = editSuffixes[Math.floor(Math.random() * editSuffixes.length)]
  let newBody = post.body
  if (newBody.length + suffix.length <= 180) {
    newBody += suffix
  }

  const updated = editPost(post.id, { topic: post.topic, body: newBody })
  const html = await renderCard(updated)
  broadcast('edit-post', html, updated.day_key)
  console.log(`[BOT] Edited post: ${post.id}`)
}

export async function startBot({ broadcast, renderCard }) {
  try {
    await loadSeeds()
  } catch (err) {
    console.error('[BOT] Failed to load seeds:', err.message)
    return
  }
  console.log(`[BOT] Loaded ${seeds.length} seed posts — watching for inactivity`)

  const loop = async () => {
    while (true) {
      const idle = Date.now() - lastHumanActivity

      if (idle > INACTIVITY_THRESHOLD && botSleeping) {
        botSleeping = false
        console.log('[BOT] Waking up — no human activity detected')
      }

      if (!botSleeping) {
        const day = todayKey()
        const totalPosts = getDayPostCount(day)
        const botPosts = getBotPostCount(day)

        // Respect 5% daily cap
        if (totalPosts === 0 || botPosts / (totalPosts + 1) < MAX_DAILY_RATIO) {
          let actionsThisCycle = 0

          while (actionsThisCycle < MAX_PER_CYCLE) {
            // Check if human appeared
            if (Date.now() - lastHumanActivity < INACTIVITY_THRESHOLD) {
              botSleeping = true
              console.log('[BOT] Human activity detected — going back to sleep')
              break
            }

            try {
              if (Math.random() < 0.4) {
                await botCreatePost(broadcast, renderCard)
              } else {
                await botEditRandomPost(broadcast, renderCard)
              }
            } catch (err) {
              console.error('[BOT] Action error:', err.message)
            }

            actionsThisCycle++
            await sleep(5000) // Brief pause between actions
          }
        }
      }

      const wait = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL)
      await sleep(wait)
    }
  }

  // Run loop in background
  loop().catch(err => console.error('[BOT] Fatal error:', err))
}
