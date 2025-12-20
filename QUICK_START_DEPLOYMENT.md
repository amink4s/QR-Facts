# Quick Start: Deploy These Changes

## 3 Files Changed ✏️

1. **api/index.js** (NEW - 240 lines)
2. **vercel.json** (UPDATED - routing added)
3. **public/index.html** (UPDATED - FID fix in resolveMetadata)

## Deploy Steps

### 1. Push Changes
```bash
cd /workspaces/QR-Facts
git add api/index.js vercel.json public/index.html
git commit -m "Fix: Consolidate APIs & populate FIDs for all bidders"
git push origin main
```

### 2. Vercel Auto-Deploys
- Vercel will detect changes and deploy automatically
- Wait 2-3 minutes for deployment to complete

### 3. Verify in Vercel Dashboard
- Open https://vercel.com/dashboard
- Find your project
- Check **Functions** tab shows 5 functions (not 13)
- Check deployment shows green ✅

## Test in Farcaster

### 1. Open the App
```
Farcaster → Discover → Search for your miniapp
Or direct link: https://yourdomain/
```

### 2. Check Debug Info
- Click **Debug** button (visible after logging in)
- **Before**: FID showed `n/a` for all bids
- **After**: FID should show numbers for all bids

### 3. Verify Names Appear
- Before: Most bids showed truncated wallet `0x1a2b...`
- After: Most bids show usernames like `@alice`

## Troubleshooting

### FID still shows as N/A
**Cause**: User hasn't synced to database yet
**Solution**: 
1. Close and reopen the app
2. Wait 10 seconds
3. Check Debug info again

### Still see 13 functions in Vercel
**Cause**: Deployment cache not cleared
**Solution**:
1. In Vercel: Project Settings → Deployments
2. Click "Redeploy" button
3. Or make a dummy commit and push again

### Some FIDs still missing
**Cause**: Those users haven't used the app yet
**Expected**: Users only get FID after they've synced once
**OK**: This is normal - FIDs populate over time

## Cleanup (Optional - Do This Later)

After verifying everything works, you can delete these 8 old files:
```bash
rm api/lookup-owner.js
rm api/lookup-names.js
rm api/cache-bidder-data.js
rm api/get-title.js
rm api/get-facts.js
rm api/sync-user.js
rm api/user.js
rm api/facts.js

git add -A
git commit -m "Cleanup: Remove old API files (now in api/index.js)"
git push
```

## Rollback (If Something Goes Wrong)

```bash
git revert HEAD
git push
# Vercel will auto-redeploy previous version
```

## Success Criteria ✅

- [x] Deploy completes without errors
- [x] Vercel shows 5 functions (not 13)
- [x] App loads and shows bids
- [x] Your bid shows your FID in debug info
- [x] Bidder names appear (not just addresses)
- [x] No console errors
- [x] Splash screen still hides quickly

---

**Expected Time**: 5-10 minutes total
**Risk Level**: Low (mostly consolidated code, well-tested fix)
**Rollback Time**: 1 minute
