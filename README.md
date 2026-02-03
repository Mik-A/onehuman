# One Human CMS

A secure, passwordless frontend CMS with magic email links for authentication. No passwords, no database complexity.

## Features

- ✅ **Passwordless Authentication** - Secure email login links (no passwords stored)
- ✅ **Magic Email Links** - 15-minute verification links sent to email
- ✅ **Email Whitelist** - Restrict access to authorized emails only
- ✅ **Inline Editing** - Click elements to edit text content
- ✅ **Image Upload** - Upload images with authentication
- ✅ **File-based Storage** - JSON files (no database needed)
- ✅ **Security Hardened** - Helmet.js, rate limiting, XSS prevention, input sanitization
- ✅ **Lightweight** - Minimal dependencies, fast startup

## Security Features

- 🔒 **Helmet.js** - Sets security headers (CSP, X-Frame-Options, etc.)
- 🔒 **Rate Limiting** - 5 login attempts per 15 min, 100 API/min
- 🔒 **XSS Prevention** - Content sanitization with whitelist
- 🔒 **Token Validation** - Strict hex format validation
- 🔒 **Email Verification** - One-time use tokens
- 🔒 **Session Expiry** - 7-day automatic logout
- 🔒 **HTTPS Ready** - CSP compliant

See [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for detailed security information.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Emails
Edit `config/emails.json` to whitelist authorized users:
```json
{
  "emails": [
    "mika@example.com",
    "admin@example.com"
  ]
}
```

### 3. Configure Email (SMTP)
Set environment variables in `.env`:
```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@onehuman.ai
BASE_URL=http://localhost:3000

# Server
PORT=3000
NODE_ENV=development
```

**For Gmail:**
- Enable 2-factor authentication
- Generate an [App Password](https://myaccount.google.com/apppasswords)
- Use app password in `SMTP_PASS`

### 4. Start Server
```bash
npm start
```

Server runs on `http://localhost:3000`

## How to Use

1. **Login**: Click user icon (bottom-right) → Enter email → Check email for login link
2. **Click Link**: Open link from email to create 7-day session
3. **Edit Content**: On public site (`/`), click elements to edit (after login)
4. **Upload Images**: Use image upload in CMS
5. **Save**: Changes auto-save to `data/content.json`
6. **Logout**: Click logout button

## File Structure

```
.
├── server.js                # Express server & API
├── package.json             # Dependencies
├── .env                     # Environment variables (create from template)
├── SECURITY_AUDIT.md        # Security audit report
├── config/
│   └── emails.json          # Whitelisted emails
├── data/
│   ├── sessions.json        # Active sessions
│   ├── login_links.json     # Login verification tokens
│   └── content.json         # Saved content
├── public/
│   ├── index.html           # CMS dashboard
│   ├── styles.css           # Stylesheet
│   └── images/              # Uploaded images
├── index.html               # Public website
└── styles.css               # Public styles
```

## API Endpoints

### Authentication
- `POST /api/auth/request-link` - Request login link (rate limited)
- `GET /auth/verify?token=...` - Verify login link, create session
- `POST /api/auth/logout` - Logout (requires token)
- `GET /api/auth/check` - Check if logged in

### Content
- `GET /api/content` - Get all content
- `POST /api/content/save` - Save content (requires auth)

### Images
- `POST /api/upload/image` - Upload image (requires auth)

## How It Works

### Login Flow
1. User clicks user icon and enters email
2. Server validates email against whitelist
3. Email sent with unique verification link
4. Link contains secure token (valid 15 minutes)
5. Clicking link creates 7-day session
6. Session token stored in browser localStorage
7. Session token sent with API requests (Authorization header)

### Content Editing
1. Authenticated user can view/edit content
2. Content saved to `data/content.json`
3. All content sanitized to prevent XSS
4. Changes immediately available to public site

### Rate Limiting
- Login: 5 attempts per 15 minutes per IP
- API: 100 requests per minute per IP
- Prevents brute force and DDoS attacks

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SMTP_HOST` | Yes | Email provider SMTP server |
| `SMTP_PORT` | Yes | SMTP port (usually 587 or 465) |
| `SMTP_USER` | Yes | Email address |
| `SMTP_PASS` | Yes | Email password or app password |
| `SMTP_FROM` | No | From address (default: noreply@onehuman.ai) |
| `BASE_URL` | No | App URL for email links (default: http://localhost:3000) |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | development or production |

## Deployment

### Before Production
1. ✅ Set `NODE_ENV=production`
2. ✅ Configure SMTP with production email provider
3. ✅ Set `BASE_URL` to your domain (HTTPS)
4. ✅ Use strong `SMTP_PASS` (use environment variables, never commit)
5. ✅ Enable HTTPS/SSL certificates
6. ✅ Consider database for sessions/links (instead of JSON files)
7. ✅ Set up monitoring and logging

### Recommended Providers
- **Email**: SendGrid, AWS SES, Mailgun, Gmail (with app password)
- **Hosting**: Heroku, Railway, Vercel, AWS, DigitalOcean
- **Database**: PostgreSQL, MongoDB (future enhancement)

## Known Limitations

- Sessions stored in JSON (use database in production)
- Login links stored in JSON (use database in production)
- No user profiles or permissions (all authenticated users have same access)
- Max content length: 10,000 characters per field

## Future Enhancements

- [ ] PostgreSQL/MongoDB support
- [ ] Multi-user roles and permissions
- [ ] Content versioning/history
- [ ] 2-factor authentication
- [ ] IP whitelist option
- [ ] Webhook notifications

## Support

For issues or questions, see SECURITY_AUDIT.md for security concerns.

## License

MIT
