document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: '', pfp: '', score: 0, wallet: '', fid: null },
        bids: [],
        loading: true,
        modalOpen: false,
        form: { title: '', article: '', ca: '', url: '' },
        claimedToday: false,

        init() {
            this.login();  // Auto-login
            this.loadBids();
        },

        async login() {
            try {
                const { QuickAuth } = window['@farcaster/auth-kit'];
                const auth = QuickAuth({});
                const result = await auth.signIn();

                if (!result?.success) {
                    console.warn('Login failed');
                    return;
                }

                const { fid, signerApprovalData } = result;
                const wallet = signerApprovalData.address.toLowerCase();

                // Get Neynar key from proxy
                const keyRes = await fetch('/api/neynar-key');
                const keyJson = await keyRes.json();
                const neynarKey = keyJson.key;

                // Fetch user data
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
                    username: userData.username || 'Anonymous',
                    pfp: userData.pfp_url || '',
                    score
                };

                console.log('Logged in:', this.user);

                // Check claim status
                this.checkClaimStatus();
            } catch (e) {
                console.error('Login error:', e);
                alert('Login failed — retry');
            }
        },

        async loadBids() {
            this.loading = true;
            this.bids = [];

            try {
                const { createPublicClient, http } = viem;

                const baseChain = {
                    id: 8453,
                    name: 'Base',
                    network: 'base',
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                    rpcUrls: {
                        default: { http: ['https://mainnet.base.org'] },
                        public: { http: ['https://mainnet.base.org'] },
                    },
                    blockExplorers: {
                        default: { name: 'Basescan', url: 'https://basescan.org' },
                    },
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

                console.log('Raw bids:', rawBids);

                this.bids = rawBids.map(bid => ({
                    url: bid.urlString,
                    amount: Number(bid.totalAmount),
                    contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                    fact: null,
                    name: 'Loading username...' // Placeholder
                }));

                // Fetch usernames from Neynar
                const allWallets = [...new Set(this.bids.flatMap(b => b.contributors))].join(',');
                const keyRes = await fetch('/api/neynar-key');
                const keyJson = await keyRes.json();
                const neynarKey = keyJson.key;

                const userRes = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${allWallets}`, {
                    headers: { api_key: neynarKey }
                });
                const userJson = await userRes.json();
                const userMap = userJson.users.reduce((map, u) => {
                    map[u.custody_address.toLowerCase()] = u.username || u.display_name || u.custody_address.slice(0,6) + '...';
                    return map;
                }, {});

                this.bids = this.bids.map(bid => ({
                    ...bid,
                    name: b.contributors.map(w => '@' + (userMap[w] || w.slice(0,6) + '...')).join(', ')
                }));

                console.log('Bids with usernames:', this.bids);
            } catch (error) {
                console.error('Chain error:', error);
                this.bids = [
                    { url: 'https://farcaster.xyz/miniapps/uaKwcOvUry8F/neynartodes', amount: 360000000, contributors: ['0x8b13d663acbe3a56e06e515d05e25b1e12cb53a5'], name: '@cb91waverider', fact: null },
                    { url: 'https://farc.io/randomref', amount: 355000000, contributors: ['0xpanik'], name: '@panik', fact: null },
                    { url: 'https://farcaster.xyz/wydeorg/0xf6f7a837', amount: 350000000, contributors: ['0xwydeorg'], name: '@wydeorg', fact: null },
                    { url: 'https://contentmarketcap.com/coins/0x3ec2156D4c0A9CBdAB4a016633b7BcF6a8d68Ea2', amount: 316000000, contributors: ['0xgarrett'], name: '@garrett', fact: null },
                    { url: 'https://farcaster.xyz/miniapps/KdCXV0aKWcm6/framedl', amount: 251000000, contributors: ['0xlazyfrank'], name: '@lazyfrank', fact: null }
                ];
            }

            this.loading = false;

            if (window.miniapp && miniapp.sdk) {
                try { await miniapp.sdk.actions.ready(); } catch (e) {}
            }
        },

        isMyBid(bid) {
            return this.user.wallet && bid.contributors.includes(this.user.wallet);
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
                this.loadBids();
            } catch (e) {
                alert('Submit failed');
            }
        },

        async checkClaimStatus() {
            try {
                const res = await fetch(`/api/claim-status?fid=${this.user.fid}`);
                const data = await res.json();
                this.claimedToday = data.claimedToday;
            } catch (e) {}
        },

        get claimText() {
            if (this.user.score < 0.6) return 'Low Score - No Claim';
            if (this.claimedToday) return 'Claimed Today!';
            return this.user.score >= 0.9 ? 'Claim 500 $FACTS' : 'Claim 100 $FACTS';
        },

        get claimClass() {
            if (this.user.score < 0.6 || this.claimedToday) return 'bg-gray-700 text-gray-400';
            return 'bg-green-600 text-white hover:bg-green-500';
        },

        get claimDisabled() {
            return this.user.score < 0.6 || this.claimedToday;
        },

        claimFacts() {
            if (this.claimDisabled) return;

            const amount = this.user.score >= 0.9 ? 500 : 100;

            try {
                fetch('/api/claim', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fid: this.user.fid, amount, score: this.user.score })
                });
                this.claimedToday = true;
                alert(`Claimed ${amount} $FACTS!`);
            } catch (e) {
                alert('Claim failed');
            }
        }
    }));
});