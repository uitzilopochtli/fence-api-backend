# Fence Gallery — Access-Code API

A Netlify Functions backend that validates customer access codes by checking
GoHighLevel (GHL) for an active appointment.

---

## How it works

1. Your gallery frontend sends a `POST` to `/api/validate-code` with the
   customer's GHL contact ID.
2. The function queries the GHL Appointments API for that contact's appointments
   scheduled **today**.
3. If any appointment falls within the access window — **2 hours before** through
   **4 hours after** the appointment start time — the function returns
   `{ "valid": true }`.
4. Otherwise it returns `{ "valid": false, "error": "..." }`.

---

## Project structure

```
fence-api-backend/
├── netlify/
│   └── functions/
│       └── validate-code.js   ← serverless function (main logic)
├── public/                    ← empty; required by netlify.toml publish config
├── .env.example               ← copy to .env for local dev
├── netlify.toml               ← Netlify build & redirect config
├── package.json
└── README.md
```

---

## Environment variables

| Variable          | Description                                      |
|-------------------|--------------------------------------------------|
| `GHL_API_KEY`     | GoHighLevel Location API key (keep secret)       |
| `GHL_LOCATION_ID` | Your GHL location ID (e.g. `S6NWWugmodHfqBSf9GEw`) |

### Setting variables for production (Netlify Dashboard)

1. Go to **Netlify Dashboard → Your Site → Site Configuration → Environment
   Variables**.
2. Click **Add a variable** and add both `GHL_API_KEY` and `GHL_LOCATION_ID`.
3. Redeploy the site after saving.

> **Security note:** Never commit real API keys to git. The `.env` file is
> listed in `.gitignore` for this reason.

---

## Deployment

### Option A — Netlify CLI (recommended for first deploy)

```bash
# 1. Install dependencies
npm install

# 2. Log in to Netlify
npx netlify login

# 3. Link this folder to a Netlify site (or create a new one)
npx netlify init

# 4. Set environment variables
npx netlify env:set GHL_API_KEY     "your_real_key_here"
npx netlify env:set GHL_LOCATION_ID "S6NWWugmodHfqBSf9GEw"

# 5. Deploy
npx netlify deploy --prod
```

### Option B — GitHub + Netlify auto-deploy

1. Push this repo to GitHub.
2. In Netlify Dashboard, click **Add new site → Import an existing project**.
3. Connect the GitHub repo.
4. Set environment variables (see above).
5. Click **Deploy**.

---

## Local development

```bash
# Copy and fill in your credentials
cp .env.example .env
# Edit .env with your real GHL_API_KEY and GHL_LOCATION_ID

# Install deps
npm install

# Start local dev server (emulates Netlify Functions)
npm run dev
```

The function is then available at:
```
http://localhost:8888/api/validate-code
```

Test it with curl:
```bash
curl -X POST http://localhost:8888/api/validate-code \
  -H "Content-Type: application/json" \
  -d '{"contactId": "hsAZzqlAcxscd0xlWZ0e"}'
```

Expected responses:

```json
{ "valid": true }
```

```json
{ "valid": false, "error": "No appointment found for today." }
```

---

## API reference

### `POST /api/validate-code`

**Request body**

```json
{ "contactId": "hsAZzqlAcxscd0xlWZ0e" }
```

**Success (appointment found and within window)**

```json
HTTP 200
{ "valid": true }
```

**Failure (no appointment / outside window)**

```json
HTTP 200
{ "valid": false, "error": "No appointment found for today." }
```

**Bad request**

```json
HTTP 400
{ "valid": false, "error": "contactId is required." }
```

---

## Calling the API from your frontend

```js
async function validateCode(contactId) {
  const res = await fetch("https://your-site.netlify.app/api/validate-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId }),
  });
  return res.json(); // { valid: true } or { valid: false, error: "..." }
}
```

---

## Access window

| Setting        | Value          |
|----------------|----------------|
| Before appt    | 2 hours        |
| After appt     | 4 hours        |
| Timezone basis | UTC (GHL default) |

To adjust the window, edit these constants in `netlify/functions/validate-code.js`:

```js
const WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000;  // change 2 → desired hours
const WINDOW_AFTER_MS  = 4 * 60 * 60 * 1000;  // change 4 → desired hours
```

---

## GHL API key rotation

Your GHL API key was likely shared in plaintext at some point. Rotate it:

1. GHL → Settings → Integrations → API Keys.
2. Delete the old key, create a new one.
3. Update the `GHL_API_KEY` environment variable in Netlify.
4. Redeploy.
