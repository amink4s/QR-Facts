document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: '', pfp: '', score: 0, wallet: '', fid: null, loggedIn: false },
        bids: [],
        loading: true,
        modalOpen: false,
        form: { title: '', article: '', ca: '', url: '' },
        claimedToday: false,

        init() {
            this.loadBids();
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

                const scoreRes = await fetch(`https://api.neynar.com/v2/farcaster/user/score?fids=${fid}`, {
                    headers: { api_key: neynarKey }
                });
                const scoreJson = await scoreRes.json();
                const score = scoreJson.scores[fid]?.score || 0;

                this.user = {
                    fid,
                    wallet,
                    username: userData.username || 'User',
                    pfp: userData.pfp_url || '',
                    score,
                    loggedIn: true
                };

                this.checkClaimStatus();
            } catch (e) {}
        },

        async loadBids() {
            this.loading = true;
            this.bids = [];

            let neynarKey = null;
            try {
                const keyRes = await fetch('/api/neynar-key');
                neynarKey = (await keyRes.json()).key;
            } catch (e) {}

            try {
                const { createPublicClient, http } = viem;

                const baseChain = {
                    id: 8453,
                    name: 'Base',
                    rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
                };

                const client = createPublicClient({
                    chain: baseChain,
                    transport: http('https://mainnet.base.org')
                });

                const contractAddress = '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da';

                const rawBids = await client.readContract({
                    address: contractAddress,
                    abi: [{
                        inputs: [],
                        name: "getAllBids",
                        outputs: [{
                            components: [
                                { internalType: "uint256", name: "totalAmount", type: "uint256" },
                                { internalType: "string", name: "urlString", type: "string" },
                                {
                                    components: [
                                        { internalType: "address", name: "contributor", type: "address" },
                                        { internalType: "uint256", name: "amount", type: "uint256" },
                                        { internalType: "uint256", name: "timestamp", type: "uint256" }
                                    ],
                                    internalType: "struct AuctionTypesV4.BidContribution[]",
                                    name: "contributions",
                                    type: "tuple[]"
                                }
                            ],
                            internalType: "struct AuctionTypesV4.Bid[]",
                            name: "",
                            type: "tuple[]"
                        }],
                        stateMutability: "view",
                        type: "function"
                    }],
                    functionName: 'getAllBids'
                });

                let processedBids = rawBids.map(bid => ({
                    url: bid.urlString,
                    amount: Number(bid.totalAmount),
                    contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                    projectName: this.extractProjectName(bid.urlString),
                    name: 'Loading...',
                    fact: null
                }));

                if (neynarKey && processedBids.length > 0) {
                    const wallets = [...new Set(processedBids.flatMap(b => b.contributors))];
                    const addrStr = wallets.join(',');
                    const res = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addrStr}`, {
                        headers: { api_key: neynarKey }
                    });
                    const data = await res.json();
                    const map = {};
                    (data.users || []).forEach(u => {
                        map[u.custody_address.toLowerCase()] = `@${u.username || u.display_name || 'unknown'}`;
                        (u.verified_addresses?.eth_addresses || []).forEach(a => map[a.toLowerCase()] = `@${u.username || u.display_name || 'unknown'}`);
                    });

                    processedBids = processedBids.map(b => ({
                        ...b,
                        name: b.contributors.length > 1 ? 'Group Bid' : map[b.contributors[0]] || b.contributors[0].slice(0,6) + '...' + b.contributors[0].slice(-4)
                    }));
                }

                this.bids = processedBids;
            } catch (error) {
                console.warn('Chain failed — current top bids');
                this.bids = [
                    { url: 'https://hunt.town', amount: 400000000, projectName: 'hunt town', name: '@if', fact: null }, // Top if current
                    { url: 'https://farcaster.xyz/wydeorg/0xf6f7a837', amount: 325000000, projectName: 'WYDEORG', name: '@wydeorg', fact: null },
                    { url: 'https://contentmarketcap.com/coins/0x3ec2156D4c0A9CBdAB4a016633b7BcF6a8d68Ea2', amount: 316000000, projectName: 'Content Market Cap', name: 'contentmarketcap', fact: null },
                    { url: 'https://farcaster.xyz/miniapps/KdCXV0aKWcm6/framedl', amount: 251000000, projectName: 'Framedl', name: '@lazyfrank', fact: null },
                    { url: 'https://farcaster.xyz/miniapps/uaKwcOvUry8F/neynartodes', amount: 150000000, projectName: 'NEYNARtodes', name: '@cb91waverider', fact: null }
                ];
            }

            this.loading = false;

            if (window.miniapp && miniapp.sdk) {
                try { await miniapp.sdk.actions.ready(); } catch (e) {}
            }
        },

        extractProjectName(url) {
            try {
                const pathname = new URL(url).pathname;
                const lastPart = pathname.split('/').filter(p => p).pop() || new URL(url).hostname;
                return lastPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            } catch (e) {
                return 'Unknown Project';
            }
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
                    body: JSON.stringify({ ...this.form, fid: this.user.fid || null })
                });
                alert('Facts submitted!');
                this.modalOpen = false;
                this.loadBids();
            } catch (e) {
                alert('Submit failed');
            }
        },

        // claim logic
    }));
});