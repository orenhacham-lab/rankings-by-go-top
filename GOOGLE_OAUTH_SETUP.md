# Google OAuth Setup Guide

## Problem: "Sign in with external provider failed"

If you're seeing "כניסה עם ספק חיצוני נכשלה. בדוק שהספק מופעל בהגדרות Supabase" (Sign in with external provider failed), it means:

**The environment variables are not set, or the app hasn't been redeployed after setting them.**

---

## How It Works

1. **Local Development**: Environment variables in `.env.local` are compiled into the JavaScript bundle at build time
2. **Vercel Deployment**: Environment variables must be set in Vercel Project Settings AND you must trigger a new deployment/rebuild

If env vars exist in Vercel but you don't redeploy, the old code (with empty env vars) is still running.

---

## Step-by-Step Fix

### Step 1: Set Environment Variables in Vercel

Go to your Vercel project settings:
1. Navigate to Settings → Environment Variables
2. Add these variables:

**Public Variables** (visible in client code):
```
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = your_client_id_here.apps.googleusercontent.com
NEXT_PUBLIC_APP_URL = https://www.gotopseo.com
NEXT_PUBLIC_SUPABASE_URL = your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY = your_anon_key
```

**Secret Variables** (server-side only):
```
GOOGLE_OAUTH_CLIENT_SECRET = your_client_secret_here
SUPABASE_SERVICE_ROLE_KEY = your_service_role_key
```

### Step 2: Get Your Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID (if you don't have one)
3. Set **Authorized redirect URIs** to:
   ```
   https://www.gotopseo.com/api/auth/callback
   ```
4. Copy the **Client ID** and **Client Secret**

### Step 3: Trigger a New Deployment

**Critical**: Just setting the env vars isn't enough. You must redeploy:

Option A (Recommended):
- Push a new commit to your main branch
- Vercel will automatically redeploy with the new env vars

Option B:
- In Vercel dashboard, go to Deployments
- Click on the latest deployment
- Click "Redeploy" button

Option C:
- In Vercel dashboard, go to Settings → Git
- Find your repository
- Click "Redeploy" from the Deployments tab

### Step 4: Verify It's Working

After deployment completes, test the debug endpoint:
```
curl https://www.gotopseo.com/api/debug-env
```

You should see:
```json
{
  "environment": {
    "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID": "your-client-id.apps.googleusercontent.com",
    "NEXT_PUBLIC_APP_URL": "https://www.gotopseo.com",
    ...
  }
}
```

**If you still see "(NOT SET)", the environment variables weren't saved properly in Vercel.**

---

## How the Custom Google OAuth Flow Works

1. User clicks "Sign in with Google" on login page
2. Code checks if `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is set
3. If YES → Custom Google OAuth flow (shows your domain)
   - Redirects to: `https://accounts.google.com/o/oauth2/v2/auth?...`
   - State parameter is marked with `custom-google_` prefix
4. If NO → Falls back to Supabase OAuth (shows Supabase domain) ← This is what's happening now

When callback arrives with `custom-google_` state prefix:
1. Exchange authorization code for Google tokens
2. Get user info from Google
3. Create or get user in Supabase
4. Sign in user with derived password
5. Redirect to dashboard

---

## Debugging

### Check Console Logs (Browser DevTools)

1. Open browser DevTools (F12)
2. Go to Console tab
3. On login page, look for `[AUTH DEBUG]` group
4. You'll see:
   - `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: ...` (should be your client ID)
   - `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is truthy: true` (should be true)

### Check Vercel Deployment Logs

1. Go to your Vercel project
2. Click on the latest deployment
3. Click "View Function Logs" or "View Build Logs"
4. Look for `[Google OAuth]` entries showing:
   - Token exchange success/failure
   - User info retrieval
   - User creation or existing user found
   - Session creation

---

## Common Issues

### Issue 1: Still seeing Supabase error
**Cause**: Environment variables not set in Vercel or old code still deployed
**Solution**: 
1. Verify env vars in Vercel Settings → Environment Variables
2. Redeploy the project (Deployments → Redeploy latest)

### Issue 2: Environment variables are set but debug endpoint shows "(NOT SET)"
**Cause**: Vercel cached old build or env vars weren't saved properly
**Solution**:
1. Delete the variable
2. Re-add it exactly as shown above (copy-paste to avoid typos)
3. Wait 30 seconds
4. Click "Redeploy latest"

### Issue 3: Google OAuth callback fails
**Cause**: Authorized redirect URI doesn't match
**Solution**:
1. Go to Google Cloud Console
2. Click on your OAuth app credentials
3. Verify "Authorized redirect URIs" contains exactly: `https://www.gotopseo.com/api/auth/callback`
4. If different, update it and save

### Issue 4: User created but can't sign in after OAuth
**Cause**: Database issue or session not established
**Solution**:
1. Check Vercel logs for `[Google OAuth] User signed in successfully`
2. If it says user was created but sign in failed, check Supabase logs
3. Verify SUPABASE_SERVICE_ROLE_KEY is correct

---

## Local Testing

To test locally:

1. Create `.env.local` with your actual credentials:
```
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=your_client_id.apps.googleusercontent.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

2. Add `http://localhost:3000/api/auth/callback` to Google OAuth authorized URIs

3. Run: `npm run dev`

4. Test at: `http://localhost:3000/login`

5. Check console for `[AUTH DEBUG]` logs

---

## Deployment Checklist

- [ ] Google OAuth app created in Google Cloud Console
- [ ] Client ID and Secret copied
- [ ] Authorized redirect URIs set to: `https://www.gotopseo.com/api/auth/callback`
- [ ] Environment variables added to Vercel:
  - [ ] NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
  - [ ] NEXT_PUBLIC_APP_URL
  - [ ] GOOGLE_OAUTH_CLIENT_SECRET
  - [ ] Other required env vars
- [ ] New deployment triggered in Vercel
- [ ] Deployment completed successfully
- [ ] `/api/debug-env` shows all variables with values
- [ ] Browser console shows `[AUTH DEBUG]` logs on login page
- [ ] Custom Google OAuth redirects to accounts.google.com (not Supabase)
