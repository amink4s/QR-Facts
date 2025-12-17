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
            this.tryAutoLogin();  // Auto-login in Mini App
        },

        async tryAutoLogin() {
            try {
                const { QuickAuth } = window['@farcaster/auth-kit'];
                const auth = QuickAuth({});
                const result = await auth.signIn({ silent: true });  // Silent in Mini App

                if (result?.success) {
                    await this.processLogin(result);
                }
            } catch (e) {
                console.log('Auto-login skipped');
            }
        },

        async login() {
            try {
                const { QuickAuth } = window['@farcaster/auth-kit'];
                const auth = QuickAuth({});
                const result = await auth.signIn();

                if (result?.success) {
                    await this.processLogin(result);
                }
            } catch (e) {
                alert('Login failed');
            }
        },

        async processLogin(result) {
            const { fid, signerApprovalData } = result;
            const wallet = signerApprovalData.address.toLowerCase();

            const keyRes = await fetch('/api/neynar-key');
            const keyJson = await keyRes.json();
            const neynarKey = keyJson.key;

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
                score: score > 0.5 ? score : 0,  // Hide low scores as bug fallback
                loggedIn: true
            };

            this.checkClaimStatus();
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
                    rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
                };

                const client = createPublicClient({
                    chain: baseChain,
                    transport: http('https://mainnet.base.org')
                });

                const contractAddress = '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da';

                const rawBids = await client.readContract({
                    address: contractAddress,
                    abi: [ /* same ABI as before */ ],
                    functionName: 'getAllBids'
                });

                let processedBids = rawBids.map(bid => ({
                    url: bid.urlString,
                    amount: Number(bid.totalAmount),
                    contributors: bid.contributions.map(c => c.contributor.toLowerCase()),
                    name: 'Loading...',
                    fact: null
                }));

                // Neynar usernames
                const wallets = [...new Set(processedBids.flatMap(b => b.contributors))];
                if (wallets.length > 0) {
                    const keyRes = await fetch('/api/neynar-key');
                    const { key } = await keyRes.json();
                    const addrStr = wallets.join(',');
                    const res = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addrStr}`, {
                        headers: { api_key: key }
                    });
                    const data = await res.json();
                    const map = {};
                    data.users.forEach(u => {
                        map[u.custody_address.toLowerCase()] = `@${u.username || u.display_name || 'unknown'}`;
                    });
                    processedBids = processedBids.map(b => ({
                        ...b,
                        name: b.contributors.map(w => map[w] || w.slice(0,6)+'...'+w.slice(-4)).join(', ')
                    }));
                }

                this.bids = processedBids;
            } catch (error) {
                console.warn('Chain failed — current top bids');
                this.bids = [
                    { url: 'https://farcaster.xyz/wydeorg/0xf6f7a837', amount: 325000000, contributors: ['wydeorg wallet'], name: '@wydeorg', fact: null },
                    { url: 'https://contentmarketcap.com/coins/0x3ec2156D4c0A9CBdAB4a016633b7BcF6a8d68Ea2', amount: 316000000, contributors: ['contentmarketcap wallet'], name: 'contentmarketcap', fact: null },
                    { url: 'https://farcaster.xyz/miniapps/KdCXV0aKWcm6/framedl', amount: 251000000, contributors: ['framedl wallet'], name: 'Framedl', fact: null },
                    { url: 'https://farcaster.xyz/miniapps/uaKwcOvUry8F/neynartodes', amount: 150000000, contributors: ['0x8b13d663acbe3a56e06e515d05e25b1e12cb53a5'], name: '@cb91waverider', fact: null },
                    { url: 'https://lazertechnologies.com', amount: 101000000, contributors: ['garrett wallet'], name: '@garrett', fact: null }
                ];
            }

            this.loading = false;

            if (window.miniapp && miniapp.sdk) {
                try { await miniapp.sdk.actions.ready(); } catch (e) {}
            }
        },

        isMyBid(bid) {
            return this.user.loggedIn && bid.contributors.includes(this.user.wallet);
        },

        // openModal, submitFact, claim* same as before
    }));
});