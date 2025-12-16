import { sdk } from 'https://miniapps.farcaster.xyz/sdk.js';  // ESM import (works because script is module)
document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: '', pfp: '', score: 0, wallet: '', fid: null },
        bids: [],
        loading: false,
        modalOpen: false,
        form: { title: '', article: '', ca: '', url: '' },
        claimedToday: false,

        async init() {
            this.login();
        },

        async login() {
            const { QuickAuth } = window['@farcaster/auth-kit'];
            const auth = QuickAuth({});
            const result = await auth.signIn();

            if (!result?.success) {
                alert('Login failed — try again');
                return;
            }

            const { fid, signerApprovalData } = result;
            const wallet = signerApprovalData.address;

            // Neynar fetches
            const keyRes = await fetch('/api/neynar-key');
            const keyJson = await keyRes.json();
            const neynarKey = keyJson.key;
            const userRes = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
                headers: { api_key: neynarKey }
            });
            const userJson = await userRes.json();
            const userData = userJson.users[0];

            const scoreRes = await fetch(`https://api.neynar.com/v2/farcaster/user/score?fids=${fid}`, {
                headers: { api_key: neynarKey }
            });
            const scoreJson = await scoreRes.json();
            const score = scoreJson.scores[fid]?.score || 0;

            this.user = {
                fid,
                wallet: wallet.toLowerCase(),
                username: userData.username,
                pfp: userData.pfp_url,
                score
            };

            // Upsert user in DB
            await fetch('/api/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.user)
            });

            this.loadBids();
            this.checkClaimStatus();
        },

        async loadBids() {
            this.loading = true;

            // On-chain fetch using viem
            const { createPublicClient, http } = viem;
            const client = createPublicClient({
                chain: viem.base,
                transport: http()
            });

            const contractAddress = '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da';

            const rawBids = await client.readContract({
                address: contractAddress,
                abi: [
                    {
                        "inputs": [],
                        "name": "getAllBids",
                        "outputs": [
                            {
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
                            }
                        ],
                        "stateMutability": "view",
                        "type": "function"
                    }
                ],
                functionName: 'getAllBids'
            });

            this.bids = rawBids.map(bid => ({
                url: bid.urlString,
                amount: Number(bid.totalAmount),
                contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                fact: null
            }));

            // Load facts from DB
            const factsRes = await fetch('/api/facts');
            const facts = await factsRes.json();

            this.bids = this.bids.map(bid => ({
                ...bid,
                fact: facts.find(f => f.url_string === bid.url)
            }));

            this.loading = false;
            // Hide splash screen once everything is loaded
            try {
                await sdk.actions.ready();
            } catch (e) {
                console.log('Not in Mini App environment or SDK not ready');
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
            if (!this.form.title || !this.form.article) return alert('Fill title & article');

            await fetch('/api/submit-fact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...this.form, fid: this.user.fid })
            });

            alert('Facts submitted! +200 $FACTS bonus coming soon');
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

        async checkClaimStatus() {
            const res = await fetch(`/api/claim-status?fid=${this.user.fid}`);
            const data = await res.json();
            this.claimedToday = data.claimedToday;
        },

        async claimFacts() {
            if (this.claimDisabled) return;

            const amount = this.user.score >= 0.9 ? 500 : 100;

            await fetch('/api/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fid: this.user.fid, amount, score: this.user.score })
            });

            this.claimedToday = true;
            alert(`Claimed ${amount} $FACTS! (logged — airdrop soon)`);
        }
    }));
});