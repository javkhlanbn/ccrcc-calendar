<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2f3c72e9-767e-4757-8d22-6df474c8588a

## Run Locally

**Prerequisites:** Node.js, PHP 8+, MySQL (XAMPP/WAMP/Laragon)


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Configure MySQL (phpMyAdmin) connection in `.env.local` (or system env):
   - `DB_HOST=127.0.0.1`
   - `DB_PORT=3306`
   - `DB_USER=root`
   - `DB_PASSWORD=`
   - `DB_NAME=ccrcc_calendar`
   - Optional admin seed:
     - `ADMIN_USERNAME=admin`
     - `ADMIN_PASSWORD=admin12345`
4. Make sure Apache serves this project and `mod_rewrite` is enabled.
5. Run frontend dev server:
   `npm run dev`

Notes:
- API is served by PHP router at `api/index.php`.
- During local Vite development, `/api/*` calls are proxied to `http://127.0.0.1/calendar/api/*` by default.
- If you use a virtual host (project at web root), set `VITE_LOCAL_API_PREFIX=` in `.env.local` to remove `/calendar` prefix.
- On first API request, database/tables and admin account are auto-created.

## Auth Behavior

- Login/Register now uses MySQL (visible in phpMyAdmin) via backend API.
- Username-based auth is supported (no `@` required).
- New users are created with `pending` status.
