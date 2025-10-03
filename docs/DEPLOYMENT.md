# Deployment Guide

This project consists of a Vite/React frontend and an Express backend that stores user data, quotas, and uploads in Firebase Firestore. Sessions are handled with `express-session`; if a `DATABASE_URL` is provided the session store will use PostgreSQL via `connect-pg-simple`, otherwise it falls back to the in-memory store (only suitable for development).

## 1. Prerequisites

- Node.js 18+ (project tested on 22.x)
- Firebase project with a service-account credential (for Firestore access)
- Optional: PostgreSQL database if you want durable server-side sessions
- Google Cloud project with OAuth consent screen (for Google login)
- Hosting for the backend (Render Web Service, Railway, Fly.io, etc.)

## 2. Environment Variables

Copy `.env.example` into `.env` and fill in the following:

| Variable | Description |
| --- | --- |
| PORT | Express listen port (defaults to 4000). |
| SESSION_SECRET | Large random string for cookie signing. |
| SESSION_COOKIE_DOMAIN | Optional cookie domain (e.g. `.yourdomain.com`). Leave blank for local dev. |
| FIREBASE_PROJECT_ID | Firebase project ID. |
| FIREBASE_CLIENT_EMAIL | Client email from the service-account JSON. |
| FIREBASE_PRIVATE_KEY | Private key from the service-account JSON (escape newlines as `\n`). |
| FIREBASE_SERVICE_ACCOUNT_PATH / FIREBASE_SERVICE_ACCOUNT_BASE64 | Optional alternatives to the variables above; supply either a file path or base64 encoded JSON. |
| OPENAI_API_KEY | OpenAI API key used by insight routes. |
| OPENAI_MODEL | Override the LLM model (defaults to gpt-4o-mini). |
| OPENAI_SYSTEM_PROMPT | Customise the default system prompt for insights. |
| ALPHA_VANTAGE_API_KEY | API key for price data. |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Credentials from Google Cloud OAuth. |
| GOOGLE_CALLBACK_URL | Backend callback (e.g. https://api.yourapp.com/auth/google/callback). |
| CORS_ALLOWED_ORIGINS | Comma separated origins that may call the backend. Include dev + production hosts. |
| OAUTH_SUCCESS_REDIRECT | Frontend URL to return to after Google login (e.g. https://mrluca95.github.io/PrismAI/). |
| OAUTH_FAILURE_REDIRECT | Frontend URL for OAuth failures (e.g. /login?error=oauth). |
| PRISM_TIER_* vars | Optional overrides for plan limits. |
| DATABASE_URL | *(Optional)* PostgreSQL connection string. If present it is used for `connect-pg-simple` session storage. |

## 3. Firebase Setup

1. In the Firebase console create a new project (or reuse an existing one).
2. Enable Firestore in **Native mode**.
3. Create a service account (Project Settings ? Service accounts ? Generate new private key).
4. Save the generated JSON and expose it to the backend using either:
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, or
   - `FIREBASE_SERVICE_ACCOUNT_PATH` pointing to the JSON file, or
   - `FIREBASE_SERVICE_ACCOUNT_BASE64` / `_JSON` containing the JSON payload.
5. If you intend to use a PostgreSQL-backed session store, provision a database and supply `DATABASE_URL`. The table `user_sessions` will be created automatically by `connect-pg-simple`.

## 4. Google OAuth Configuration

1. In Google Cloud Console:
   - Create an OAuth consent screen (External).
   - Add authorised domains (e.g. render.com, your custom domain).
   - Create an OAuth client (Web application) with authorised redirect URI `https://<backend-host>/auth/google/callback`.
2. Copy Client ID/Secret into `.env`.
3. Update `OAUTH_SUCCESS_REDIRECT` / `OAUTH_FAILURE_REDIRECT` to match your frontend URLs.

## 5. Running Locally

```
npm install
npm run server      # Backend on http://localhost:4000
npm run dev         # Frontend on http://localhost:5173
```

Ensure the frontend uses the same origin via `VITE_API_BASE_URL`. Because the app relies on cookies, enable "send credentials" in your development HTTP client.

## 6. Deploying the Backend (Render example)

1. Create a **Web Service** on Render.
2. Build command:
   ```
   npm install
   ```
3. Start command:
   ```
   npm run server
   ```
4. Add environment variables from `.env` (including `NODE_VERSION`).
5. Set `CORS_ALLOWED_ORIGINS` to include both local dev and production frontend origins.
6. Enable the Render health check (`/api/health`).
7. After deploy, note the public URL—use it for `VITE_API_BASE_URL` and OAuth callbacks.

## 7. Deploying the Frontend

- GitHub Pages is configured via `.github/workflows/deploy.yml`.
- Ensure the repository variable `VITE_API_BASE_URL` points to the backend's public URL (e.g. `https://prism-api.onrender.com`).
- Every push to `main` triggers the build and deploy workflow.

## 8. Session & Cookies

- In production the cookie is `SameSite=None; Secure`. Ensure the backend runs behind HTTPS.
- Set `SESSION_COOKIE_DOMAIN` if hosting frontend + backend on sibling subdomains.
- Without `DATABASE_URL` the in-memory store is used; do not rely on it for production deployments.

## 9. Plan & Usage Limits

- Plans default to:
  - Free: 20 insights / 200 price lookups per period
  - Plus: 200 / 2000
  - Pro: 1000 / 10000
- Override limits with the `PRISM_TIER_*` env vars.
- Usage is tracked per user per calendar month in Firestore collections.
- Tier updates call `POST /api/account/tier`, profile updates call `PATCH /api/account/profile`.

## 10. Frontend Auth Flow

- `AuthProvider` fetches the session via `/auth/me`, exposes `login`, `register`, `logout`, `updateProfile`, and `updateTier` helpers.
- The login page supports email/password and Google (when configured).
- Private routes redirect to `/login` when unauthenticated.
- Settings displays current plan, usage, and allows plan changes via `updateTier`.

Refer to `server/index.js` for API routes and `src/context/AuthContext.jsx` for the client state machine.
