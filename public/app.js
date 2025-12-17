document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: '', pfp: '', score: 0, wallet: '', fid: null, loggedIn: false },
        bids: [],
        loading: true,
        modalOpen: false,
        form: { title: '', article: '', ca: '', url: '' },
        
        async init() {
            // 1. Tell Farcaster the app is ready (hides splash screen)
            if (window.farcaster?.sdk) {
                try {
                    await window.farcaster.sdk.actions.ready();
                } catch (e) { console.error("SDK Ready failed", e); }
            }

            // 2. Load data and auto-login
            await this.loadBids();
            this.autoLogin();
        },

        async autoLogin() {
            // In a Mini App, the context is provided automatically
            if (window.farcaster?.sdk?.context) {
                const context = window.farcaster.sdk.context;
                const userFid = context.user?.fid;
                const userWallet = context.user?.custodyAddress?.toLowerCase();

                if (userFid) {
                    try {
                        const keyRes = await fetch('/api/neynar-key');
                        const { key: neynarKey } = await keyRes.json();

                        const userRes = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${userFid}`, {
                            headers: { api_key: neynarKey }
                        });
                        const userJson = await userRes.json();
                        const userData = userJson.users[0] || {};

                        this.user = {
                            fid: userFid,
                            wallet: userWallet,
                            username: userData.username || 'User',
                            pfp: userData.pfp_url || '',
                            // This is the score you need for the claim logic (0.0 to 1.0)
                            score: userData.user_score || 0, 
                            loggedIn: true
                        };
                    } catch (e) { console.error("Auto-login Neynar error", e); }
                }
            }
        },

        async loadBids() {
            this.loading = true;
            try {
                const { createPublicClient, http } = viem;
                const baseChain = {
                    id: 8453,
                    name: 'Base',
                    network: 'base',
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                    rpcUrls: { default: { http: ['https://mainnet.base.org'] } }
                };

                const client = createPublicClient({
                    chain: baseChain,
                    transport: http('https://mainnet.base.org')
                });

                const contractAddress = '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da';

                const rawBids = await client.readContract({
                    address: contractAddress,
                    abi: [{
                        "inputs": [],
                        "name": "getAllBids",
                        "outputs": [{
                            "components": [
                                { "internalType": "uint256", "name": "totalAmount", "type": "uint256" },
                                { "internalType": "string", "name": "urlString", "type": "string" },
                                {
                                    "components": [
                                        { "internalType": "address", "name": "contributor", "type": "address" },
                                        { "internalType": "uint256", "name": "amount", "type": "uint256" },
                                        { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
                                    ],
                                    "internalType": "struct AuctionTypesV4.BidContribution[]",
                                    "name": "contributions",
                                    "type": "tuple[]"
                                }
                            ],
                            "internalType": "struct AuctionTypesV4.Bid[]",
                            "name": "",
                            "type": "tuple[]"
                        }],
                        "stateMutability": "view",
                        "type": "function"
                    }],
                    functionName: 'getAllBids'
                });

                let processedBids = rawBids.map(bid => ({
                    url: bid.urlString,
                    amount: Number(bid.totalAmount),
                    contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                    projectName: this.extractProjectName(bid.urlString),
                    name: bid.contributions[0]?.contributor.slice(0,6) + '...',
                    fact: null
                })).sort((a, b) => b.amount - a.amount);

                // Neynar User Mapping for Bidder Names
                try {
                    const keyRes = await fetch('/api/neynar-key');
                    const { key: neynarKey } = await keyRes.json();
                    
                    if (neynarKey && processedBids.length > 0) {
                        const wallets = [...new Set(processedBids.flatMap(b => b.contributors))];
                        const res = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${wallets.slice(0, 10).join(',')}`, {
                            headers: { api_key: neynarKey }
                        });
                        const data = await res.json();
                        const map = {};
                        (data.users || []).forEach(u => {
                            const label = `@${u.username}`;
                            map[u.custody_address.toLowerCase()] = label;
                            (u.verified_addresses?.eth_addresses || []).forEach(a => map[a.toLowerCase()] = label);
                        });

                        processedBids = processedBids.map(b => ({
                            ...b,
                            name: b.contributors.length > 1 ? 'Group Bid' : map[b.contributors[0]] || b.name
                        }));
                    }
                } catch (e) { console.warn("Neynar bidders lookup failed"); }

                this.bids = processedBids;
            } catch (error) {
                console.error('Chain error:', error);
                // Fallback with MORE than 2 items
                this.bids = [
                    { url: 'https://hunt.town', amount: 400000000, projectName: 'Hunt Town', name: '@if', contributors: [] },
                    { url: 'https://farc.io/neynartodes', amount: 360000000, projectName: 'Neynar Todes', name: '@cb91waverider', contributors: [] },
                    { url: 'https://farcaster.xyz/wydeorg', amount: 325000000, projectName: 'WYDEORG', name: '@wydeorg', contributors: [] },
                    { url: 'https://framedl.xyz', amount: 251000000, projectName: 'Framedl', name: '@lazyfrank', contributors: [] }
                ];
            } finally {
                this.loading = false;
            }
        },

        extractProjectName(url) {
            try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                const rawName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : urlObj.hostname;
                return rawName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            } catch (e) { return 'Unknown Project'; }
        },

        isMyBid(bid) {
            return this.user.loggedIn && bid.contributors.includes(this.user.wallet);
        },

        openModal(bid) {
            this.form = { title: '', article: '', ca: '', url: bid.url };
            this.modalOpen = true;
        },

        async submitFact() {
            if (!this.form.title || !this.form.article) return alert('Fill title & article');
            try {
                await fetch('/api/submit-fact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...this.form, fid: this.user.fid })
                });
                alert('Facts submitted!');
                this.modalOpen = false;
            } catch (e) { alert('Submission failed.'); }
        },

        claimFacts() {
            if (this.user.score >= 0.9) {
                alert(`High quality user (Score: ${this.user.score.toFixed(2)})! Full claim available.`);
            } else if (this.user.score >= 0.6) {
                alert(`Standard user (Score: ${this.user.score.toFixed(2)}). Half claim available.`);
            } else {
                alert(`Score too low (${this.user.score.toFixed(2)}) to claim.`);
            }
        }
    }));
});