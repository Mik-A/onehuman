# CLAUDE.md

## Code Standards

This project uses modern JavaScript. No exceptions.

### JavaScript

- **`const` by default.** Use `let` only when reassignment is necessary. Never use `var`.
- **ES modules.** Use `import`/`export`. No `require()`, no `module.exports`.
- **Arrow functions** for callbacks and anonymous functions. Named `function` declarations for top-level functions only when hoisting is needed.
- **Template literals** for string interpolation. No string concatenation with `+`.
- **Destructuring** for objects and arrays when extracting multiple values.
- **`async`/`await`** for asynchronous code. No raw `.then()` chains. No callbacks.
- **Optional chaining** (`?.`) and **nullish coalescing** (`??`) instead of manual checks.
- **`for...of`** for iteration. No `for...in` for arrays. `.map()`, `.filter()`, `.reduce()` when transforming data.
- **Strict equality** (`===` / `!==`). Never `==` or `!=`.
- **No `arguments` object.** Use rest parameters (`...args`).
- **Object shorthand** for properties and methods.

### Node.js

- **ES modules in package.json:** `"type": "module"`.
- **Node built-in imports** with `node:` prefix: `import { readFile } from 'node:fs/promises'`.
- **Top-level await** is allowed.
- **Environment variables** via `process.env`. No dotenv in production code.
- **Error handling:** try/catch with specific error types. No silent catches. Log or rethrow.

### HTML/CSS

- **Semantic HTML.** Use `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>`, `<main>`. No `<div>` soup.
- **CSS custom properties** (`--var-name`) for theming and repeated values.
- **No inline styles** in HTML. All styling in CSS files or `<style>` blocks.
- **Modern CSS layout:** Grid and Flexbox. No floats for layout.
- **Logical properties** preferred (`margin-block`, `padding-inline`) but not required.
- **`rem`** for font sizes. **`px`** for borders and fine details. **`%`** or viewport units for layout dimensions.

### SQLite

- **Prepared statements** with parameterized queries. Never interpolate values into SQL strings.
- **`INTEGER PRIMARY KEY`** for auto-increment IDs (SQLite alias for rowid).
- **Snake_case** for table and column names.
- **Explicit column lists** in INSERT and SELECT. No `SELECT *` in application code.
- **WAL mode** enabled for concurrent reads.
- **Transactions** for multi-statement writes.

### General

- **Single quotes** for JavaScript strings. Double quotes only in HTML attributes.
- **No semicolons** (rely on ASI) — OR — **always semicolons**. Pick one, never mix. Default: **no semicolons**.
- **2-space indentation** everywhere.
- **Trailing commas** in multiline objects, arrays, function parameters.
- **One concept per file.** Small, focused modules.
- **Name things clearly.** No abbreviations except universally understood ones (`id`, `url`, `db`).
