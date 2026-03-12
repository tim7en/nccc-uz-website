# NCCC Uzbekistan Portal

Public portal and local CMS backend for the National Climate Change Center of Uzbekistan.

## Stack

- Public site: `index.html`, `assets/css/styles.css`, `assets/js/app.js`
- Content files: `assets/data/site-content.json`, `assets/data/ui.json`
- Backend: `server.js` with Express, sessions, bcrypt, rate limiting, and TOTP support
- Admin UI: `admin/index.html`, `assets/css/admin.css`, `assets/js/admin.js`
- Runtime storage: `server-data/` for users, contact messages, and activity logs

## What Works Now

- Public portal served by the Node backend
- Admin login with server-side sessions
- Password hashing with `bcryptjs`
- Role-based access (`admin`, `moderator`)
- Admin JSON editor for `site-content.json`
- Admin-only JSON editor for `ui.json`
- Admin user creation and password reset
- Activity log for auth and CMS actions
- Public contact form persistence through `/api/public/contact`
- Admin message review and status updates
- TOTP setup flow for admin accounts

## Run Locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the backend:

   ```bash
   npm start
   ```

3. Run the backend smoke test:

   ```bash
   npm run smoke
   ```

4. Open:

   - Public portal: `http://127.0.0.1:3000/`
   - Admin CMS: `http://127.0.0.1:3000/admin/`

## Initial Admin Account

On first startup, the backend seeds one local admin user if `server-data/users.json` does not exist.

- Username: `admin`
- Password: `ChangeMe123!`

You can override this on first run with environment variables:

- `NCCC_ADMIN_USERNAME`
- `NCCC_ADMIN_PASSWORD`
- `SESSION_SECRET`
- `PORT`

After first login, enable TOTP from the Security tab.

## Notes

- This backend writes portal edits back into the existing JSON files so the public frontend continues to work without a rebuild step.
- `server-data/` is intentionally ignored by Git because it contains local runtime state.
- This is a practical local backend phase. It is not yet the final production architecture from the technical specification: there is still no PostgreSQL/MySQL database, no production mail pipeline, no file upload pipeline, and no full granular content model.
