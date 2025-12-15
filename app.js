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
            const neynarKey = '01C49CC8-1E94-459D-8BD5-C56E7D6A8390';
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

            // Scrape qrcoin.fun via CORS proxy + parse HTML
            const proxy = 'https://api.allorigins.win/raw?url=';
            const html = await fetch(proxy + encodeURIComponent('https://qrcoin.fun/')).then(r => r.text());

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const bidElements = doc.querySelectorAll('.bid-item'); // Actual class may vary — inspect & update if needed

            const rawBids = [];
            bidElements.forEach(el => {
                const name = el.querySelector('.username')?.textContent.trim() || 'Anonymous';
                const amountText = el.querySelector('.amount')?.textContent.trim() || '0';
                const amount = parseFloat(amountText.replace(/[^0-9.]/g, '')) * 1e6; // USDC
                const url = el.querySelector('a')?.href || '';

                // Contributors (multiple addresses possible)
                const contributors = Array.from(el.querySelectorAll('.contributor-address')).map(c => c.textContent.trim().toLowerCase());

                if (url) rawBids.push({ name, amount, url, contributors: contributors.length ? contributors : [url.slice(0,42).toLowerCase()] });
            });

            this.bids = rawBids;

            // Load facts from DB
            const factsRes = await fetch('/api/facts');
            const facts = await factsRes.json();

            this.bids = this.bids.map(bid => ({
                ...bid,
                fact: facts.find(f => f.url_string === bid.url && new Date(f.auction_date).toDateString() === new Date().toDateString())
            }));

            this.loading = false;
        },

        isMyBid(bid) {
            return this.user.wallet && bid.contributors.includes(this.user.wallet);
        },

        openModal(bid) {
            this.form = {
                title: '',
                article: '',
                ca: bid.url.startsWith('0x') ? bid.url : '',
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