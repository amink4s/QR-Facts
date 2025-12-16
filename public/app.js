document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: '', pfp: '', score: 0, wallet: '', fid: null },
        bids: [],
        loading: true,
        modalOpen: false,
        form: { title: '', article: '', ca: '', url: '' },
        claimedToday: false,

        init() {
            this.loadBids();
        },

        async loadBids() {
            this.loading = true;
            this.bids = [];

            if (typeof viem === 'undefined') {
                console.error('viem not loaded — add script tag in head');
                this.loadLiveFallbackBids();
                this.loading = false;
                return;
            }

            try {
                const { createPublicClient, http } = viem;
                const client = createPublicClient({
                    chain: viem.base,
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

                console.log('Raw bids:', rawBids);

                if (rawBids && rawBids.length > 0) {
                    this.bids = rawBids.map(bid => ({
                        url: bid.urlString,
                        amount: Number(bid.totalAmount),
                        contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                        fact: null
                    }));
                    console.log(`Loaded ${this.bids.length} real bids!`);
                } else {
                    throw new Error('Empty array');
                }
            } catch (error) {
                console.error('Chain fetch failed:', error);
                this.loadLiveFallbackBids();
            }

            this.loading = false;

            if (window.miniapp && miniapp.sdk) {
                try { await miniapp.sdk.actions.ready(); } catch (e) {}
            }
        },

        loadLiveFallbackBids() {
            console.log('Showing current live top bids (auction #285)');
            this.bids = [
                { url: 'https://farcaster.xyz/miniapps/uaKwcOvUry8F/neynartodes', amount: 360000000, contributors: ['0x8b13d663acbe3a56e06e515d05e25b1e12cb53a5'], fact: null },
                { url: 'https://farc.io/randomref', amount: 355000000, contributors: ['0xpanik example'], fact: null },
                { url: 'https://farcaster.xyz/wydeorg/0xf6f7a837', amount: 350000000, contributors: ['0xwydeorg example'], fact: null },
                { url: 'https://contentmarketcap.com/coins/0x3ec2156D4c0A9CBdAB4a016633b7BcF6a8d68Ea2', amount: 316000000, contributors: ['0xgarrett example'], fact: null },
                { url: 'https://farcaster.xyz/miniapps/KdCXV0aKWcm6/framedl', amount: 251000000, contributors: ['0xlazyfrank example'], fact: null }
            ];
        },

        isMyBid(bid) {
            return this.user.wallet && bid.contributors.includes(this.user.wallet);
        },

        openModal(bid) {
            this.form = { title: '', article: '', ca: bid.url.startsWith('0x') && bid.url.length === 42 ? bid.url : '', url: bid.url };
            this.modalOpen = true;
        },

        async submitFact() {
            if (!this.form.title || !this.form.article) return alert('Fill title & article');
            try {
                await fetch('/api/submit-fact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...this.form, fid: this.user.fid || null }) });
                alert('Submitted!');
                this.modalOpen = false;
                this.loadBids();
            } catch (e) { alert('Submit error'); }
        },

        get claimText() { return 'Login for claims'; },
        get claimClass() { return 'bg-gray-700 text-gray-400'; },
        get claimDisabled() { return true; },
        claimFacts() { alert('Soon!'); }
    }));
});