// Import Mini App SDK for ready()
import { sdk } from 'https://miniapps.farcaster.xyz/sdk.js';

document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        // Core state
        user: { username: '', pfp: '', score: 0, wallet: '', fid: null },
        bids: [],
        loading: true,
        modalOpen: false,
        form: { title: '', article: '', ca: '', url: '' },
        claimedToday: false,

        // Start app immediately
        init() {
            this.loadBids(); // Load bids first
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
                                    internalType: "struct AuctionTypesV4.BidContribution[]",  // Fixed namespace
                                    name: "contributions",
                                    type: "tuple[]"
                                }
                            ],
                            internalType: "struct AuctionTypesV4.Bid[]",  // Fixed struct name
                            name: "",
                            type: "tuple[]"
                        }],
                        stateMutability: "view",
                        type: "function"
                    }],
                    functionName: 'getAllBids'
                });

                console.log('Raw bids from contract:', rawBids);

                if (rawBids && rawBids.length > 0) {
                    this.bids = rawBids.map(bid => ({
                        url: bid.urlString,
                        amount: Number(bid.totalAmount),
                        contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                        fact: null
                    }));
                    console.log('Live bids loaded:', this.bids.length, 'bids');
                } else {
                    console.warn('Chain returned no bids — using fallback');
                    this.loadFallbackBids();
                }
            } catch (error) {
                console.error('Chain fetch failed:', error);
                this.loadFallbackBids();
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
            } catch (e) {
                console.warn('DB facts load skipped:', e);
            }

            this.loading = false;

            // Hide splash in Mini App
            if (typeof sdk !== 'undefined') {
                try {
                    await sdk.actions.ready();
                } catch (e) {}
            }
        },

        loadFallbackBids() {
            // Current live bids (Dec 16, 2025) — UI will show these if chain fails
            this.bids = [
                { url: 'https://farcaster.miniapp/neynartodes', amount: 360000000, contributors: ['0x8b13d663acbe3a56e06e515d05e25b1e12cb53a5'], fact: null },
                { url: 'https://randomref.farc.io', amount: 355000000, contributors: ['0xpanikaddresshere'], fact: null },
                { url: 'https://wyde.org/link', amount: 350000000, contributors: ['0xwydeorgaddress'], fact: null }
            ];
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
                alert('Fill title and article');
                return;
            }

            try {
                await fetch('/api/submit-fact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...this.form, fid: this.user.fid || null })
                });
                alert('Facts submitted!');
            } catch (e) {
                alert('Submit error');
                console.error(e);
            }

            this.modalOpen = false;
            this.loadBids();
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