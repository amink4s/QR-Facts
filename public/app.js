document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: '', pfp: '', score: 0, wallet: '', fid: null, loggedIn: false },
        bids: [],
        loading: true,
        
        // Reader State
        readerOpen: false,
        activeBid: null,
        timerStarted: false,
        canFinish: false,
        countdown: 7,

        // Edit State
        editModalOpen: false,
        form: { title: '', article: '', ca: '', url: '' },

        async init() {
            console.log("Initializing App...");
            
            // 1. Ensure Viem is loaded
            if (!window.viem) {
                console.error("Viem not found on window. Retrying in 1s...");
                setTimeout(() => this.init(), 1000);
                return;
            }

            // 2. Clear Splash Screen immediately
            if (window.farcaster?.sdk) {
                try {
                    await window.farcaster.sdk.actions.ready();
                    console.log("Farcaster SDK Ready");
                } catch (e) { console.warn("SDK Ready error:", e); }
            }

            // 3. Load Data
            await this.loadBids();
            await this.autoLogin();
        },

        async loadBids() {
            this.loading = true;
            console.log("Fetching Bids...");
            
            try {
                const { createPublicClient, http } = window.viem;
                
                // Using a reliable public mirror for Base
                const client = createPublicClient({ 
                    chain: { id: 8453, name: 'Base' }, 
                    transport: http('https://mainnet.base.org'),
                    pollingInterval: 4_000 
                });

                // Set a timeout for the contract call
                const contractPromise = client.readContract({
                    address: '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da',
                    abi: [{ "inputs": [], "name": "getAllBids", "outputs": [{ "components": [{ "name": "totalAmount", "type": "uint256" }, { "name": "urlString", "type": "string" }, { "name": "contributions", "type": "tuple[]", "components": [{ "name": "contributor", "type": "address" }] }], "type": "tuple[]" }], "stateMutability": "view", "type": "function" }],
                    functionName: 'getAllBids'
                });

                // Race the contract call against a 10-second timeout
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("RPC Timeout")), 10000)
                );

                const rawBids = await Promise.race([contractPromise, timeoutPromise]);
                console.log("Raw Bids received:", rawBids.length);

                const factsRes = await fetch('/api/facts');
                const savedFacts = await factsRes.json();

                this.bids = rawBids.map(bid => {
                    const fact = savedFacts.find(f => f.url_string === bid.urlString);
                    return {
                        url: bid.urlString,
                        amount: Number(bid.totalAmount),
                        contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                        projectName: this.extractProjectName(bid.urlString),
                        name: bid.contributions[0]?.contributor.slice(0,6) || 'Unknown',
                        fact: fact || null,
                        hasRead: false,
                        claiming: false,
                        claimed: false
                    };
                }).sort((a, b) => b.amount - a.amount);

            } catch (error) {
                console.error('CRITICAL LOAD ERROR:', error);
                // If it fails, we show at least one "Empty" state so the user isn't stuck on a spinner
                if (this.bids.length === 0) {
                    this.bids = []; 
                }
            } finally {
                this.loading = false;
            }
        },

        async autoLogin() {
            if (!window.farcaster?.sdk?.context) return;
            const context = window.farcaster.sdk.context;
            const fid = context.user?.fid;
            const wallet = context.user?.custodyAddress?.toLowerCase();

            if (fid) {
                try {
                    const keyRes = await fetch('/api/neynar-key');
                    const { key } = await keyRes.json();

                    const userRes = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
                        headers: { api_key: key }
                    });
                    const userData = (await userRes.json()).users[0] || {};

                    this.user = {
                        fid,
                        wallet,
                        username: userData.username || 'user',
                        pfp: userData.pfp_url || '',
                        score: userData.user_score || 0,
                        loggedIn: true
                    };

                    fetch('/api/user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(this.user)
                    });

                    await this.checkExistingClaims();
                } catch (e) { console.error("Login sync failed", e); }
            }
        },

        async checkExistingClaims() {
            if (!this.user.fid) return;
            try {
                const res = await fetch(`/api/check-claims?fid=${this.user.fid}`);
                const data = await res.json();
                const claimedUrls = data.claimedUrls || [];
                
                this.bids = this.bids.map(bid => ({
                    ...bid,
                    claimed: claimedUrls.includes(bid.url),
                    hasRead: claimedUrls.includes(bid.url)
                }));
            } catch (e) { console.error("Claim check failed", e); }
        },

        openReader(bid) {
            this.activeBid = bid;
            this.readerOpen = true;
            this.timerStarted = false;
            this.canFinish = false;
            this.countdown = 7;
            setTimeout(() => {
                this.timerStarted = true;
                const interval = setInterval(() => {
                    this.countdown--;
                    if (this.countdown <= 0) {
                        this.canFinish = true;
                        clearInterval(interval);
                    }
                }, 1000);
            }, 100);
        },

        finishReading() {
            this.activeBid.hasRead = true;
            this.readerOpen = false;
        },

        async claim(bid) {
            if (!this.user.loggedIn) return alert("Please log in first.");
            bid.claiming = true;
            try {
                const res = await fetch('/api/claims', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fid: this.user.fid,
                        url: bid.url,
                        wallet: this.user.wallet,
                        score: this.user.score
                    })
                });
                const data = await res.json();
                if (data.success) {
                    bid.claimed = true;
                    alert(`Claimed! TX Hash: ${data.txHash.slice(0,10)}...`);
                } else {
                    alert(data.error || "Claim failed.");
                }
            } catch (e) { alert("Claim error."); }
            finally { bid.claiming = false; }
        },

        openEditModal(bid) {
            this.activeBid = bid;
            this.form = { 
                title: bid.fact?.title || '', 
                article: bid.fact?.article || '', 
                ca: bid.fact?.ca_or_link || '', 
                url: bid.url,
                fid: this.user.fid
            };
            this.editModalOpen = true;
        },

        async submitFact() {
            try {
                await fetch('/api/submit-fact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.form)
                });
                this.editModalOpen = false;
                await this.loadBids(); 
            } catch (e) { alert("Save failed."); }
        },

        isMyBid(bid) {
            return this.user.loggedIn && bid.contributors.includes(this.user.wallet);
        },

        extractProjectName(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.hostname.replace('www.', '');
            } catch (e) { return 'Project'; }
        }
    }));
});