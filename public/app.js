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

                // 1. Fetch the raw bid data
                const rawBids = await contract.getAllBids();

                // 2. Fetch all "AuctionBid" events to find the names
                // We go back 50,000 blocks (~1 day) to find recent names
                const filter = contract.filters.AuctionBid();
                const events = await contract.queryFilter(filter, -50000);
                
                // Create a map of URL -> Name
                const nameMap = {};
                events.forEach(event => {
                    if (event.args && event.args.urlString) {
                        nameMap[event.args.urlString] = event.args.name;
                    }
                });

                // 3. Process bids using the names found in events
                this.bids = rawBids.map(bid => {
                    const creatorAddr = bid.contributions[0].contributor;
                    const url = bid.urlString;
                    
                    return {
                        url: url,
                        amount: Number(bid.totalAmount),
                        // Get name from event logs, fallback to URL or Unnamed
                        projectName: nameMap[url] || "Unnamed Project",
                        creatorAddress: creatorAddr.toLowerCase(),
                        creatorUsername: creatorAddr.slice(0, 6),
                        hasRead: false,
                        claiming: false,
                        claimed: false,
                        fact: { title: '', article: '' }
                    };
                });

                this.bids.sort((a, b) => b.amount - a.amount);
                
                // 4. Resolve Farcaster Usernames
                await this.resolveUsernames();

            } catch (error) {
                console.error('Failed to load bids:', error);
            } finally {
                this.loading = false;
            }
        },

        async resolveUsernames() {
            const addresses = [...new Set(this.bids.map(b => b.creatorAddress))].join(',');
            if (!addresses) return;

            try {
                // Adjust this path to your actual Vercel API endpoint
                const res = await fetch(`/api/lookup-names?addresses=${addresses}`);
                if (!res.ok) throw new Error("API failed");
                const data = await res.json();
                
                this.bids.forEach(bid => {
                    if (data[bid.creatorAddress]) {
                        bid.creatorUsername = data[bid.creatorAddress];
                    }
                });
            } catch (e) { 
                console.error("Neynar API resolution error:", e);
            }
        },

        // --- Standard UI Logic ---
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
        }
    }));
});