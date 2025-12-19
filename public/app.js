document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: 'anonymous', pfp: '', wallet: '', fid: 0, loggedIn: false },
        bids: [],
        loading: true,
        // ... UI states ...

        async init() {
            // Wait for SDK to load from module
            const checkSDK = setInterval(async () => {
                if (window.fc_sdk) {
                    clearInterval(checkSDK);
                    const context = await window.fc_sdk.context;

                    if (context?.user) {
                        const custody = context.user.custodyAddress;
                        const wallet = custody ? custody.toLowerCase() : null;
                        console.debug('fc context user:', { username: context.user.username, hasCustody: !!custody, fid: context.user.fid });
                        this.user = {
                            username: context.user.username || 'anonymous',
                            pfp: context.user.pfpUrl || '',
                            wallet: wallet,
                            fid: context.user.fid,
                            loggedIn: true
                        };
                        // 1. Sync User to Neon DB
                        try {
                            const r = await fetch('/api/sync-user', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(this.user)
                            });
                            if (!r.ok) console.warn('sync-user failed', await r.json());
                        } catch (e) { console.error('sync-user request failed', e); }
                    } else {
                        // No context user: try QuickAuth authorize (if available) to prompt the user and obtain credentials
                        try {
                            if (window.fc_sdk?.actions?.authorize) {
                                const auth = await window.fc_sdk.actions.authorize();
                                // Re-read context after authorization
                                const newCtx = await window.fc_sdk.context;
                                if (newCtx?.user) {
                                    const custody = newCtx.user.custodyAddress;
                                    const wallet = custody ? custody.toLowerCase() : null;
                                    this.user = {
                                        username: newCtx.user.username || 'anonymous',
                                        pfp: newCtx.user.pfpUrl || '',
                                        wallet: wallet,
                                        fid: newCtx.user.fid,
                                        loggedIn: true
                                    };
                                    try {
                                        const r = await fetch('/api/sync-user', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(this.user)
                                        });
                                        if (!r.ok) console.warn('sync-user failed', await r.json());
                                    } catch (e) { console.error('sync-user request failed', e); }
                                }
                            }
                        } catch (e) { console.warn('QuickAuth authorize failed or not supported', e); }
                    }

                    // 2. IMPORTANT: HIDE SPLASH SCREEN
                    await window.fc_sdk.actions.ready();
                    
                    // 3. Load Bids
                    await this.loadBids();
                }
            }, 100);
        },

        async loadBids() {
            // Existing loadBids logic... 
            // Ensure you use .toLowerCase() on all wallets from contract!
            this.bids = rawBids.map(bid => ({
                url: bid.urlString,
                bidderWallet: bid.contributions[0].contributor.toLowerCase(),
                // ...
            }));
        },

        async claim(bid) {
            if (!this.user.loggedIn) return alert("Please log in via Farcaster");
            try {
                const res = await fetch('/api/claims', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wallet: this.user.wallet, url: bid.url })
                });
                const data = await res.json();
                alert(data.message || data.error || (res.ok ? 'Claim successful' : 'Claim failed'));
            } catch (e) { alert('Claim failed: ' + e.message); }
        }
    }));
});