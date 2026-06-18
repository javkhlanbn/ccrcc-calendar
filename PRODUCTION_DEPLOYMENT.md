# Production Deployment Guide (PHP + MySQL)

## 1. Project Build

```bash
npm install
npm run build
```

Build output is generated in dist.

## 2. Server Structure

Upload dist contents into domain root (public_html) and keep API folder in the same root:

```text
/public_html
  /api
    .htaccess
    index.php
  /assets
  index.html
  .htaccess
```

Required files:
- api/index.php
- api/.htaccess
- .htaccess
- dist output files (index.html + assets)

## 3. Environment Setup

Create .env.local in project root used by PHP API:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ccrcc_calendar
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin12345
```

If your hosting blocks reading .env.local from outside document root, set the same values as system environment variables.

## 4. Apache Requirements

Enable modules:
- mod_rewrite

api/.htaccess rewrites all API routes to api/index.php.
Root .htaccess keeps SPA fallback and excludes /api.

## 5. Health Check

After deploy, verify API:

```bash
curl -i https://your-domain/api/health
```

Expected:
- HTTP 200
- JSON response with status: ok

## 6. Troubleshooting

1. API returns 404:
- Confirm api folder exists in domain root.
- Confirm api/.htaccess is uploaded.
- Confirm mod_rewrite is enabled.

2. API returns 500:
- Check PHP error log.
- Check DB credentials.
- Ensure PDO MySQL extension is enabled.

3. API returns 503:
- Hosting/WAF may block PHP execution in api path.
- Check server error log and hosting security rules.

4. Frontend loads but API fails:
- Open https://your-domain/api/health directly.
- If health fails, frontend is fine and backend config is the issue.

## 7. Local Development

- Start Apache + MySQL (XAMPP).
- Run frontend: npm run dev
- Vite proxies /api to http://127.0.0.1
