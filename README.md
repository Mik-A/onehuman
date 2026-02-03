# One Human CMS

A simple, passwordless frontend CMS for editing website content without a database.

## Features

- ✅ **Passwordless Login** - Whitelist emails in `config/emails.json`
- ✅ **Inline Editing** - Click any element to edit text
- ✅ **Pen Icon on Hover** - Visual indication of editable content
- ✅ **Image Upload** - Upload and manage images in `/public/images`
- ✅ **No Database** - Content saved to `data/content.json`
- ✅ **Token-based Sessions** - Sessions stored in `data/sessions.json`
- ✅ **Simple & Lightweight** - No over-engineering, just works

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Allowed Emails
Edit `config/emails.json`:
```json
{
  "emails": [
    "your-email@example.com",
    "another-email@example.com"
  ]
}
```

### 3. Start Server
```bash
npm start
```

Server runs on `http://localhost:3000`

## How to Use

1. **Login**: Enter your whitelisted email address
2. **Edit Content**: Click any text element with a dashed outline on hover
3. **Upload Images**: Click the "Change" button on images
4. **Save**: Changes auto-save to `data/content.json`
5. **Logout**: Click logout button in toolbar

## File Structure

```
.
├── server.js              # Express server & API
├── package.json           # Dependencies
├── config/
│   └── emails.json        # Whitelisted emails
├── data/
│   ├── sessions.json      # Active sessions (auto-created)
│   └── content.json       # Saved content (auto-created)
├── public/
│   ├── index.html         # CMS editor page
│   ├── styles.css         # Stylesheet
│   └── images/            # Uploaded images
└── .env                   # Environment variables
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email
- `POST /api/auth/logout` - Logout
- `GET /api/auth/check` - Check session

### Content
- `GET /api/content` - Get all saved content
- `POST /api/content/save` - Save text content

### Images
- `POST /api/upload/image` - Upload image

## How It Works

1. **Editable Elements**: Any element with `data-selector` attribute becomes editable
2. **Pen Icon**: Appears on hover for each editable element
3. **Modal Editor**: Click to open edit modal
4. **Auto-save**: Changes save to file immediately
5. **Images**: Stored in `/public/images`, referenced in `content.json`

## Notes

- No database required - everything stored as JSON
- Sessions last 7 days
- Images stored in `/public/images` folder
- Edit any content by clicking elements
- Token stored in browser localStorage

## Production Notes

For production:
1. Set `NODE_ENV=production`
2. Add proper email whitelist
3. Use environment variables for sensitive data
4. Consider adding SSL/HTTPS
5. Implement rate limiting
