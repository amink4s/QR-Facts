// No import needed — use global 'miniapp' from CDN

document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: '', pfp: '', score: 0, wallet: '', fid: null },
        bids: [],
        loading: true,
        modalOpen: false,
        form: { title: '', article: '', ca: '', url: '' },
        claimedToday: false,

        init() {
            this.loadBids();  // Load bids immediately (login later)
        },

        async loadBids() {
            this.loading = true;
            this.bids = [];

            try {
                const { createPublicClient, http } = viem;
                const client = createPublicClient({
                    chain: viem.base,
                    transport: http()
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

                console.log('Raw bids from chain:', rawBids);

                if (rawBids && rawBids.length > 0) {
                    this.bids = rawBids.map(bid => ({
                        url: bid.urlString,
                        amount: Number(bid.totalAmount),
                        contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                        fact: null
                    }));
                    console.log('Loaded', this.bids.length, 'live bids');
                } else {
                    console.warn('No bids from chain — showing demo bids');
                    this.bids = [
                        { url: 'https://example.com/bid1', amount: 360000000, contributors: ['0xexample1'], fact: null },
                        { url: 'https://example.com/bid2', amount: 355000000, contributors: ['0xexample2'], fact: null },
                        { url: 'https://example.com/bid3', amount: 350000000, contributors: ['0xexample3'], fact: null }
                    ];
                }
            } catch (error) {
                console.error('Chain error:', error);
                this.bids = [
                    { url: 'https://fallback-bid.com', amount: 300000000, contributors: ['0xfallback'], fact: null }
                ];
            }

            // Load facts from DB
            try {
                const res = await fetch('/api/facts');
                if (res.ok) {
                    const facts = await res.json();
                    this.bids = this.bids.map(bid => ({
                        ...bid,
                        fact: facts.find(f => f.url_string === bid.url)
                    }));
                }
            } catch (e) {}

            this.loading = false;

            // Hide splash screen (safe call — only works in real Mini App)
            if (window.miniapp && miniapp.sdk) {
                try {
                    await miniapp.sdk.actions.ready();
                } catch (e) {}
            }
        },

        isMyBid(bid) {
            return this.user.wallet && bid.contributors.includes(this.user.wallet);
        },

        openModal(bid) {
            this.form = {
                title: '',
                article: '',
                ca: bid.url.startsWith('0x') && bid.url.length === 42 ? bid.url : '',
                url: bid.url
            };
            this.modalOpen = true;
        },

        async submitFact() {
            if (!this.form.title || !this.form.article) {
                alert('Title and article required');
                return;
            }

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

        get claimText() {
            if (this.user.score < 0.6) return 'Score < 0.6 — No Claim';
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

        async claimFacts() {
            if (this.claimDisabled) return;

            const amount = this.user.score >= 0.9 ? 500 : 100;

            try {
                await fetch('/api/claim', {
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