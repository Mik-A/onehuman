// ===== THE WALL — Client JS =====

// --- Fingerprint ---
function getFingerprint() {
  let fp = localStorage.getItem('wall_fp')
  if (fp) return fp
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'top'
  ctx.font = '14px Arial'
  ctx.fillText('wall-fp', 2, 2)
  fp = canvas.toDataURL().slice(-32)
  localStorage.setItem('wall_fp', fp)
  return fp
}

// --- Day tracking ---
let activeDay = ''

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('grid')
  activeDay = grid?.dataset.day || new Date().toISOString().split('T')[0]
})

// --- SSE ---
let evtSource

function connectSSE() {
  evtSource = new EventSource('/stream')

  evtSource.addEventListener('new-post', (e) => {
    const grid = document.getElementById('grid')
    if (!grid) return

    let html, dayKey
    try {
      const payload = JSON.parse(e.data)
      html = payload.html
      dayKey = payload.dayKey
    } catch {
      html = e.data
      dayKey = ''
    }

    // Only insert if the post belongs to the day we're viewing
    if (dayKey && dayKey !== activeDay) return

    // Dedup — skip if card already in DOM (from HTMX response)
    const temp = document.createElement('div')
    temp.innerHTML = html.trim()
    const newCard = temp.firstElementChild
    if (newCard && document.getElementById(newCard.id)) return

    // Remove empty placeholders
    grid.querySelectorAll('.card--empty').forEach(c => c.remove())

    // Demote current latest card
    const oldLatest = grid.querySelector('.card--latest')
    if (oldLatest) oldLatest.classList.remove('card--latest')

    // Insert after the + button (newest on top)
    const fab = grid.querySelector('.fab')
    if (fab) {
      fab.insertAdjacentHTML('afterend', html)
      const inserted = fab.nextElementSibling
      if (inserted) {
        inserted.classList.add('card--latest')
        if (typeof htmx !== 'undefined') htmx.process(inserted)
      }
    } else {
      grid.insertAdjacentHTML('afterbegin', html)
    }
  })

  evtSource.addEventListener('edit-post', (e) => {
    let html
    try {
      const payload = JSON.parse(e.data)
      html = payload.html
    } catch {
      html = e.data
    }

    const temp = document.createElement('div')
    temp.innerHTML = html.trim()
    const newCard = temp.firstElementChild
    if (!newCard) return

    const oldCard = document.getElementById(newCard.id)
    if (oldCard) {
      oldCard.replaceWith(newCard)
      if (typeof htmx !== 'undefined') htmx.process(newCard)
      newCard.classList.add('card--updated')
      setTimeout(() => newCard.classList.remove('card--updated'), 600)
    }
  })

  evtSource.onerror = () => {
    evtSource.close()
    setTimeout(connectSSE, 3000) // Auto-reconnect after 3s
  }
}

connectSSE()

// --- Modal ---
function closeModal() {
  const modal = document.getElementById('modal')
  if (modal) modal.innerHTML = ''
}

// --- Char counter ---
function updateCount(el, countId, max) {
  const span = document.getElementById(countId)
  if (span) span.textContent = `${el.value.length}/${max}`
}

// --- Origin toggle ---
async function toggleOrigin(postId) {
  const target = document.getElementById('origin-' + postId)
  if (!target) return

  // Toggle: if already has content, clear it
  if (target.innerHTML.trim()) {
    target.innerHTML = ''
    return
  }

  // Fetch and show origin
  try {
    const res = await fetch('/post/' + postId + '/origin')
    if (res.ok) {
      target.innerHTML = await res.text()
    }
  } catch {
    // Silently fail
  }
}

// --- PoW solver ---
async function solvePoW(prefix) {
  let nonce = 0
  while (true) {
    const data = new TextEncoder().encode(prefix + nonce)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    if (hex.startsWith('0000')) return nonce
    nonce++
    // Yield to main thread every 1000 iterations
    if (nonce % 1000 === 0) {
      await new Promise(r => setTimeout(r, 0))
    }
  }
}

// ===== HTMX Event Hooks =====

// Add fingerprint header to all HTMX requests
document.addEventListener('htmx:configRequest', (e) => {
  e.detail.headers['X-Fingerprint'] = getFingerprint()
})

// Handle form loading — set fingerprint + start PoW
document.addEventListener('htmx:afterSwap', async (e) => {
  const target = e.detail.target

  // Set fingerprint on any loaded form
  const fpFields = target.querySelectorAll('[name="fingerprint"]')
  fpFields.forEach(field => { field.value = getFingerprint() })

  // Set day_key on post form to the currently viewed day
  const dayKeyField = target.querySelector('#post-day-key')
  if (dayKeyField) dayKeyField.value = activeDay

  // When a new post is inserted via HTMX (after .fab), promote to latest
  if (target.classList?.contains('fab')) {
    const grid = document.getElementById('grid')
    if (grid) {
      const oldLatest = grid.querySelector('.card--latest')
      if (oldLatest) oldLatest.classList.remove('card--latest')
      grid.querySelectorAll('.card--empty').forEach(c => c.remove())
    }
    const newCard = target.nextElementSibling
    if (newCard && newCard.classList?.contains('card')) {
      newCard.classList.add('card--latest')
    }
  }

  // Track active day when grid is swapped via day pill
  if (target.id === 'grid') {
    const path = e.detail.requestConfig?.path || ''
    const match = path.match(/\/day\/(\d{4}-\d{2}-\d{2})/)
    if (match) {
      activeDay = match[1]
      // Update grid data attribute
      target.dataset.day = activeDay
      // Move active class to the clicked pill
      document.querySelectorAll('.day-pill').forEach(pill => {
        pill.classList.toggle('day-pill--active', pill.dataset.date === activeDay)
      })
    }
  }

  // Start PoW if post form was loaded
  const powPrefixField = target.querySelector('#pow-prefix')
  if (powPrefixField) {
    const status = document.getElementById('pow-status')
    const submit = document.getElementById('post-submit')

    if (status) status.textContent = 'Preparing...'
    if (submit) submit.disabled = true

    try {
      const res = await fetch('/pow-challenge')
      const { prefix } = await res.json()
      if (status) status.textContent = 'Solving challenge...'
      const nonce = await solvePoW(prefix)
      powPrefixField.value = prefix
      const nonceField = document.getElementById('pow-nonce')
      if (nonceField) nonceField.value = nonce
      if (submit) submit.disabled = false
      if (status) status.textContent = ''
    } catch {
      if (status) status.textContent = 'Error preparing post. Close and try again.'
    }
  }
})

// Close modal after successful form submission from within modal
document.addEventListener('htmx:afterRequest', (e) => {
  const verb = e.detail.requestConfig?.verb
  const elt = e.detail.requestConfig?.elt
  if (!elt) return

  if ((verb === 'post' || verb === 'put') && elt.closest('#modal') && e.detail.successful) {
    closeModal()
  }
})

// Handle error responses — show in form's error area
document.addEventListener('htmx:beforeSwap', (e) => {
  const status = e.detail.xhr?.status
  if (status && status >= 400 && status < 500) {
    // Allow the swap so the error message is shown
    e.detail.shouldSwap = true
    e.detail.isError = false

    // Retarget to the form's error container
    const elt = e.detail.requestConfig?.elt
    if (elt) {
      const form = elt.closest('form') || elt
      const errorDiv = form.querySelector('.form-errors')
      if (errorDiv) {
        e.detail.target = errorDiv
        e.detail.swapStyle = 'innerHTML'
      }
    }
  }
})

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal()
})
