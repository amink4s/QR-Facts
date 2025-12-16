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
                    console.log('Loaded', this.bids.length, 'REAL bids!');
                } else {
                    throw new Error("Empty response");
                }
            } catch (error) {
                console.warn('Using demo bids (real ones will appear next deploy)');
                this.bids = [
                    { url: 'https://farcaster.xyz/miniapps/.../neynartodes', amount: 360000000, contributors: ['0x8b13...53a5'], fact: null },
                    { url: 'https://randomref.farc.io', amount: 355000000, contributors: ['0xpanik...'], fact: null },
                    { url: 'https://wyde.org', amount: 350000000, contributors: ['0xwyde...'], fact: null }
                ];
            }

            // Skip DB facts for now to avoid 500 error
            // When you fix DB URL, uncomment below:
            // try {
            //     const res = await fetch('/api/facts');
            //     if (res.ok) {
            //         const facts = await res.json();
            //         this.bids = this.bids.map(bid => ({
            //             ...bid,
            //             fact: facts.find(f => f.url_string === bid.url)
            //         }));
            //     }
            // } catch (e) {}

            this.loading = false;

            // Hide splash
            if (window.miniapp && miniapp.sdk) {
                try { await miniapp.sdk.actions.ready(); } catch (e) {}
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
                alert('Please fill title and article');
                return;
            }
            try {
                await fetch('/api/submit-fact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...this.form, fid: this.user.fid || null })
                });
                alert('Facts submitted! 🎉');
                this.modalOpen = false;
                this.loadBids();
            } catch (e) {
                alert('Submit failed (DB not connected yet)');
            }
        },

        get claimText() {
            return this.claimedToday ? 'Claimed Today!' : 'Login to Claim $FACTS';
        },

        get claimClass() {
            return 'bg-green-600 text-white hover:bg-green-500';
        },

        get claimDisabled() { return true; },

        claimFacts() {
            alert('Login coming in next update!');
        }
    }));
});