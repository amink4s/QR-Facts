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

                console.log('Score:', score);

                this.checkClaimStatus();
            } catch (e) {
                console.warn('Login optional');
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
                    rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
                };

                const client = createPublicClient({
                    chain: baseChain,
                    transport: http('https://mainnet.base.org')
                });

                const contractAddress = '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da';

                const rawBids = await client.readContract({
                    address: contractAddress,
                    abi: [/* same as before */],
                    functionName: 'getAllBids'
                });

                this.bids = rawBids.map(bid => ({
                    url: bid.urlString,
                    amount: Number(bid.totalAmount),
                    contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                    name: bid.contributions.map(c => c.contributor.slice(0,6) + '...' + c.contributor.slice(-4)).join(', '),
                    fact: null
                }));
            } catch (error) {
                console.warn('Chain failed — using current auction #286 top bids');
                this.bids = [
                    { url: 'https://farcaster.xyz/wydeorg/0xf6f7a837', amount: 325000000, name: '@wydeorg', fact: null },
                    { url: 'https://contentmarketcap.com/coins/0x3ec2156D4c0A9CBdAB4a016633b7BcF6a8d68Ea2', amount: 316000000, name: 'contentmarketcap', fact: null },
                    { url: 'https://farcaster.xyz/miniapps/KdCXV0aKWcm6/framedl', amount: 251000000, name: 'Framedl', fact: null },
                    { url: 'https://farcaster.xyz/miniapps/uaKwcOvUry8F/neynartodes', amount: 150000000, name: 'NEYNARtodes', fact: null },
                    { url: 'https://lazertechnologies.com', amount: 101000000, name: '@cb91waverider', fact: null },
                    { url: 'https://farcaster.xyz/starl3xx.eth/0xd0c7a045', amount: 50000000, name: '@starl3xx.eth', fact: null },
                    { url: 'https://eggs.fun', amount: 41290000, name: '$EGGS', fact: null },
                    { url: 'https://farcaster.xyz/miniapps/GqooGbQfcN2L/12-days-of-frensmas', amount: 25000000, name: '@lazyfrank', fact: null },
                    { url: 'https://zora.co/@superfreshtt', amount: 18000000, name: 'superfreshtt', fact: null },
                    { url: 'https://growcorp.org/?ref=unc', amount: 12000000, name: '@LF_DAO_UNC', fact: null }
                ];
            }

            this.loading = false;

            if (window.miniapp && miniapp.sdk) {
                try { await miniapp.sdk.actions.ready(); } catch (e) {}
            }
        },

        isMyBid(bid) {
            return this.user.loggedIn && bid.contributors && bid.contributors.includes(this.user.wallet);
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

        // claim logic same
    }));
});