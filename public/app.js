document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: '', pfp: '', score: 0, wallet: '', fid: null, loggedIn: false },
        bids: [],
        loading: true,
        modalOpen: false,
        form: { title: '', article: '', ca: '', url: '' },
        
        async init() {
            // Sequential load to ensure Neynar key is available for loadBids
            await this.loadBids();
            this.tryAutoLogin();
        },

        async tryAutoLogin() {
            if (window.miniapp) this.login();
        },

        async login() {
            try {
                const { QuickAuth } = window['@farcaster/auth-kit'];
                const auth = QuickAuth({});
                const result = await auth.signIn();
                if (!result?.success) return;

                const { fid, signerApprovalData } = result;
                const wallet = signerApprovalData.address.toLowerCase();

                const keyRes = await fetch('/api/neynar-key');
                const { key: neynarKey } = await keyRes.json();

                const userRes = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
                    headers: { api_key: neynarKey }
                });
                const userJson = await userRes.json();
                const userData = userJson.users[0] || {};

                this.user = {
                    fid,
                    wallet,
                    username: userData.username || 'User',
                    pfp: userData.pfp_url || '',
                    score: userData.profile?.bio?.text?.length || 0, // Placeholder score
                    loggedIn: true
                };
            } catch (e) {
                console.error("Login error", e);
            }
        },

        async loadBids() {
            this.loading = true;
            try {
                const { createPublicClient, http } = viem;

                // 1. Manually define Base Chain to avoid 'viem.base' undefined errors
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

                // 2. Fetch all bids
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

                // 3. Process and Sort (Highest Bid First)
                let processedBids = rawBids.map(bid => ({
                    url: bid.urlString,
                    amount: Number(bid.totalAmount),
                    contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                    projectName: this.extractProjectName(bid.urlString),
                    name: bid.contributions[0]?.contributor.slice(0,6) + '...',
                    fact: null
                })).sort((a, b) => b.amount - a.amount);

                // 4. Neynar User Mapping
                try {
                    const keyRes = await fetch('/api/neynar-key');
                    const { key: neynarKey } = await keyRes.json();
                    
                    if (neynarKey && processedBids.length > 0) {
                        const wallets = [...new Set(processedBids.flatMap(b => b.contributors))];
                        const res = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${wallets.join(',')}`, {
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
                } catch (e) { console.warn("Neynar lookup failed"); }

                this.bids = processedBids;
            } catch (error) {
                console.error('Chain error:', error);
                // Fallback to static bids if chain call fails completely
                this.bids = [
                    { url: 'https://hunt.town', amount: 400000000, projectName: 'Hunt Town', name: '@if' },
                    { url: 'https://farcaster.xyz/wydeorg/0xf6f7a837', amount: 325000000, projectName: 'WYDEORG', name: '@wydeorg' }
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
            if (!this.form.title || !this.form.article) return alert('Please fill in both title and description.');
            try {
                await fetch('/api/submit-fact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...this.form, fid: this.user.fid })
                });
                alert('Facts submitted! They will appear after approval.');
                this.modalOpen = false;
            } catch (e) { alert('Submission failed.'); }
        },

        claimFacts() { alert('Claiming system coming soon!'); }
    }));
});