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
                        this.user = {
                            username: context.user.username,
                            pfp: context.user.pfpUrl,
                            wallet: context.user.custodyAddress.toLowerCase(),
                            fid: context.user.fid,
                            loggedIn: true
                        };
                        // 1. Sync User to Neon DB
                        fetch('/api/sync-user', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(this.user)
                        });
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