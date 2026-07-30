# Deploying ASHA

Vercel, auto-deploying from `main` on a private GitHub repo — the Dhruva pattern.
The Android shell is a WebView over the deployed URL, so **a push to `main`
updates the web app and the APK together**, with no reinstall and no store
review. That is the whole reason for Git integration rather than manual CLI
deploys.

## 1. Create the GitHub repo

Private. Do not initialise it with a README, `.gitignore` or licence — this repo
already has ten commits and an unrelated initial commit would need merging.

Then, with the repo's URL:

```bash
git remote add origin https://github.com/<you>/asha.git
git push -u origin main
```

## 2. Import into Vercel

New Project → import the repo. The defaults are correct (Next.js, `npm run
build`); nothing needs overriding.

**Set the production branch to `main`** if Vercel doesn't detect it.

## 3. Environment variables

Set these in Vercel → Settings → Environment Variables, for **Production** and
**Preview**.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_URL` | same value again |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `sb_publishable_…` key |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_…` key |
| `NEXT_PUBLIC_SITE_URL` | the deployment URL, once known |
| `MSG91_AUTH_KEY` | from MSG91 |
| `NEXT_PUBLIC_MSG91_WIDGET_ID` | from MSG91 |
| `NEXT_PUBLIC_MSG91_TOKEN_AUTH` | from MSG91 |

### Do NOT set the dev-mode flags

**`MSG91_DEV_MODE` and `NEXT_PUBLIC_MSG91_DEV_MODE` must not appear here at
all.** Dev mode replaces the SMS with a code derived deterministically from the
phone number, and the salt is in this repository — so on a public URL it means
anyone can compute the OTP for any number and sign in as that person.

Copying `.env.local.example` wholesale is the obvious way to make this mistake,
because that file sets both flags to `true` (correct for localhost). `lib/devMode.ts`
refuses dev mode in any production build regardless, and a test pins that — but
the guard is a backstop, not permission. Leave the flags out.

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It is used only by
`/api/account/delete` and `/api/otp/verify`, both server-only. It must never be
given a `NEXT_PUBLIC_` prefix.

## 4. Supabase settings for the live URL

- **Authentication → URL Configuration → Site URL**: the deployment URL.
- **Redirect URLs**: add the deployment URL. Not strictly required today (login
  is phone + password handoff, with no OAuth redirect), but it will be the moment
  anything email-based or OAuth is added, and it is easy to forget later.
- **Phone provider stays enabled** (see `architecture.md`, "Supabase dashboard
  configuration"). The dummy Twilio credentials remain unused — MSG91 sends the
  OTP; Supabase's phone identity is only the account key.

## 5. Point the Android shell at it

```bash
ASHA_APP_URL=https://<deployment>.vercel.app npm run android:sync
```

Then confirm what actually shipped, rather than trusting the sync:

```bash
unzip -p android/app/build/outputs/apk/debug/app-debug.apk assets/capacitor.config.json
```

A release APK additionally needs a signing keystore, which does not exist yet —
see `CLAUDE.md`. It must be backed up outside the repo, because a future Play
Store listing is permanently tied to it.

## 6. Verify the deployment

The first thing to check is that **real OTP login works**, because it is the one
path that cannot be tested locally: the MSG91 widget runs hCaptcha, and hCaptcha
refuses to run on localhost. Everything else has already been exercised against
the live database from a dev server.

Then confirm dev mode really is off: try any 10-digit number and check that no
deterministic code is accepted.

## What is deliberately not automated

Nothing here creates accounts, handles tokens, or enters credentials. The repo
creation, `vercel login`, and the environment variables are all steps that need
the account owner.
