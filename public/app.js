document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: 'anonymous', pfp: 'https://me-qr.com/static/img/default-pfp.png', wallet: '', score: 0, loggedIn: false },
        bids: [],
        loading: true,
        contractAddress: '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da',
        readerOpen: false,
        activeBid: null,
        canFinish: false,
        countdown: 7,
        timerStarted: false,
        editModalOpen: false,
        form: { title: '', article: '', ca: '' },

        async init() {
            try {
                if (window.farcaster?.miniapp) {
                    const context = await window.farcaster.miniapp.getContext();
                    this.user.username = context.user.username;
                    this.user.pfp = context.user.pfpUrl;
                    this.user.wallet = context.user.custodyAddress;
                    this.user.loggedIn = true;
                }
            } catch (e) { console.warn("Farcaster SDK not active"); }
            await this.loadBids();
        },

        async loadBids() {
            this.loading = true;
            try {
                const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
                const contract = new ethers.Contract(this.contractAddress, [
                    "function getAllBids() view returns (tuple(uint256 totalAmount, string urlString, tuple(address contributor, uint256 amount, uint256 timestamp)[] contributions)[])",
                    "event AuctionBid(uint256 indexed tokenId, address indexed bidder, uint256 indexed amount, bool extended, uint256 endTime, string urlString, string name)"
                ], provider);

                // 1. Get raw bids first so the UI shows SOMETHING immediately
                const rawBids = await contract.getAllBids();

                this.bids = rawBids.map(bid => {
                    const creatorAddr = bid.contributions[0].contributor.toLowerCase();
                    return {
                        url: bid.urlString,
                        amount: Number(bid.totalAmount),
                        projectName: "Loading Name...", // Temporary
                        creatorAddress: creatorAddr,
                        creatorUsername: creatorAddr.slice(0, 6), // Temporary
                        hasRead: false,
                        claiming: false,
                        claimed: false,
                        fact: { title: '', article: '' }
                    };
                });

                this.bids.sort((a, b) => b.amount - a.amount);
                this.loading = false; // Show the list now

                // 2. Background task: Fetch Names from Events (Try a smaller block range)
                this.enrichProjectNames(contract);

                // 3. Background task: Fetch Usernames from Neynar
                this.resolveUsernames();

            } catch (error) {
                console.error('Failed to load bids:', error);
                this.loading = false;
            }
        },

        async enrichProjectNames(contract) {
            try {
                // Limit range to 10,000 blocks to avoid RPC "Unhealthy" errors
                const events = await contract.queryFilter(contract.filters.AuctionBid(), -10000);
                
                events.forEach(event => {
                    const bid = this.bids.find(b => b.url === event.args.urlString);
                    if (bid && event.args.name) {
                        bid.projectName = event.args.name;
                    }
                });
            } catch (e) {
                console.warn("Could not fetch on-chain names from logs, RPC is busy.");
                // Fallback: If logs fail, show a nicer placeholder
                this.bids.forEach(b => { if(b.projectName === "Loading Name...") b.projectName = "Project Spotlight"; });
            }
        },

        async resolveUsernames() {
            const addresses = [...new Set(this.bids.map(b => b.creatorAddress))].join(',');
            if (!addresses) return;

            try {
                const res = await fetch(`/api/lookup-names?addresses=${addresses}`);
                const nameMap = await res.json();
                
                this.bids.forEach(bid => {
                    // Match against the lowercase address key from your API
                    if (nameMap[bid.creatorAddress]) {
                        bid.creatorUsername = nameMap[bid.creatorAddress];
                    }
                });
            } catch (e) { 
                console.error("Neynar API resolution error:", e);
            }
        },

        openReader(bid) {
            this.activeBid = bid;
            this.readerOpen = true;
            this.canFinish = false;
            this.countdown = 7;
            this.timerStarted = true;
            const timer = setInterval(() => {
                this.countdown--;
                if (this.countdown <= 0) {
                    this.canFinish = true;
                    clearInterval(timer);
                }
            }, 1000);
        },

        finishReading() {
            if (this.canFinish) {
                this.activeBid.hasRead = true;
                this.readerOpen = false;
                this.timerStarted = false;
            }
        },

        async claim(bid) {
            bid.claiming = true;
            setTimeout(() => {
                bid.claiming = false;
                bid.claimed = true;
                this.user.score += 10;
            }, 1500);
        },

        isMyBid(bid) {
            if (!this.user.wallet) return false;
            return bid.creatorAddress === this.user.wallet.toLowerCase();
        }
    }));
});