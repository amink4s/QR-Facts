# Post-Deployment Cleanup Guide

After you've deployed the changes and verified everything is working, you can safely delete these 8 old API files. They're now replaced by routing to `api/index.js`:

## Files to Delete (After Verification)

```bash
# These files are no longer called - all routed to api/index.js
rm api/lookup-owner.js
rm api/lookup-names.js
rm api/cache-bidder-data.js
rm api/get-title.js
rm api/get-facts.js
rm api/sync-user.js
rm api/user.js
rm api/facts.js
```

## Files to Keep

```
api/
  index.js ← NEW (consolidated handler)
  claims.js ← Keep (separate function)
  check-claims.js ← Keep (separate function)
  submit-fact.js ← Keep (separate function)
  save-facts.js ← Keep (separate function)
```

## Why Some Functions Remain Separate

The functions that remain separate (`claims`, `check-claims`, `submit-fact`, `save-facts`) weren't consolidated because:
- They're less frequently called (no performance impact)
- They may have different scaling requirements
- They involve complex logic that would make the main handler too large

## Vercel Dashboard

After deletion and redeployment:
- **Functions list** should show only 5 functions (index.js + 4 others)
- **API Routes** should still work the same (requests are transparently routed)
- **Deployment size** will be slightly smaller

## Verification Before Deletion

Make sure these requests still work before deleting the old files:

```bash
# Test with curl or in browser
curl "https://yourdomain/api/lookup-owner?address=0x..."
curl "https://yourdomain/api/get-title?url=https://example.com"
curl "https://yourdomain/api/get-facts?url=qr%20facts%20example"

# All should return proper JSON responses, not 404s
```

## Git Commit

```bash
git add -A
git commit -m "Cleanup: Remove old API files (now consolidated in api/index.js)"
git push
```
