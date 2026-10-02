# TubePilot

A small personal app for a YouTube Shorts workflow built around Google Labs Flow:

1. **Daily Prompts** – Gemini writes 3 new, ready-to-paste Google Flow video prompts every day. Prompts are stored in MongoDB and a topic is never generated twice. Don't like one? **Regenerate** it.
2. **Upload Video** – drop the video you made in Flow, or paste the video's Flow **Share** link (`flow.google.com/shared/video/…`) and TubePilot downloads that exact file. Share links are resolved the same way Flow's public share page does it, which isn't a documented Google API, so it could break if Google changes Flow; uploading the file always works. Only Google hosts are accepted.
3. **Auto details** – as soon as the video is uploaded, Gemini watches it and fills in the title, description and tags (validated with Zod). Edit anything; changes autosave as a draft.
4. **Upload to YouTube** – confirm, and watch the progress bar. Videos are always published as **Public**. Nothing is ever uploaded without that explicit confirmation.

TubePilot does **not** automate Google Labs Flow. You copy the prompt and generate the video yourself.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Lucide · MongoDB + Mongoose · Gemini (`@google/genai`) · YouTube Data API v3 · Google OAuth

## Setup

### 1. Google Cloud (OAuth + YouTube API)

1. Create a project at <https://console.cloud.google.com>.
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** → User type *External* → add your Google account under **Test users**. Add the scopes `youtube.upload` and `youtube.readonly`.
4. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
     (use your `APP_URL` if you host it elsewhere)
5. Copy the client ID and secret.

### 2. Gemini

Create an API key at <https://aistudio.google.com/apikey>.

### 3. MongoDB

Use a free MongoDB Atlas cluster or a local `mongod`.

### 4. Run

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

Sign in with the Google account that owns your channel. Then set **Settings → About your channel** so the daily prompts match your content.

## Things to know about Google's side

- **Uploads from unverified API projects are locked to Private.** YouTube forces videos uploaded through a Google Cloud project that hasn't passed the [YouTube API compliance audit](https://support.google.com/youtube/contact/yt_api_form) to private, even though TubePilot asks for Public. Request the audit so uploads go live as Public. Until then, change visibility in YouTube Studio after uploading.
- **"Testing" OAuth apps get refresh tokens that expire after 7 days.** If uploads start failing with "connection expired", click **Settings → Reconnect channel**. To avoid this, set the consent screen's publishing status to *In production*. You'll see an "unverified app" warning when signing in, but it works for your own account.
- **Quota:** each upload uses a large share of the default daily YouTube Data API quota. Check usage under **APIs & Services → YouTube Data API v3 → Quotas**.

## Hosting

TubePilot streams uploads to disk (`UPLOAD_DIR`) and then to YouTube, so it needs a long-running Node.js server with a persistent disk: your own computer, a VPS, Railway, Render and similar. Serverless platforms with small request-body limits and ephemeral disks (such as Vercel functions) won't work for video uploads.

When it's reachable by others, set `ALLOWED_EMAILS` and serve it over HTTPS (`APP_URL=https://…`).

Local video files are deleted automatically after a successful YouTube upload. Deleting a draft also deletes its file.

## How it works

| Path | What it does |
| --- | --- |
| `lib/prompts.ts` | Lazily generates today's 3 prompts (in your timezone) on first visit. Uniqueness: a unique `(userId, topicKey)` index plus the recent topic history sent to Gemini. Regenerated prompts are kept (`status: "replaced"`) so they never come back. |
| `lib/gemini.ts` | Gemini JSON-mode calls validated with Zod (one retry with the validation error), with retries and a fallback model when Gemini is overloaded. |
| `app/api/videos/route.ts` | Streams the raw upload body to disk with a size limit. |
| `app/api/videos/[id]/file/route.ts` | Range-enabled video streaming for the preview player. |
| `app/api/videos/[id]/publish/route.ts` | Requires `confirmed: true`, atomically claims the video (no double uploads), uploads to YouTube as Public and streams NDJSON progress. |
| `app/api/auth/google/*` | Google OAuth. Tokens are AES-GCM encrypted in MongoDB; the session is an HMAC-signed cookie. |
| `proxy.ts` | Redirects signed-out visitors to `/login`. Excludes `/api`, so video uploads are never buffered by the proxy. |
