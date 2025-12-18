document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: 'anonymous', pfp: '', wallet: '', score: 0, loggedIn: false },
        bids: [],
        loading: true,
        contractAddress: '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da',
        readerOpen: false,
        activeBid: null,
        canFinish: false,
        countdown: 7,

        async init() {
            if (window.farcaster?.miniapp) {
                const context = await window.farcaster.miniapp.getContext();
                this.user = { 
                    username: context.user.username, 
                    pfp: context.user.pfpUrl, 
                    wallet: context.user.custodyAddress,
                    loggedIn: true 
                };
            }
            await this.loadBids();
        },

        async loadBids() {
            this.loading = true;
            try {
                const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
                const contract = new ethers.Contract(this.contractAddress, [
                    "function getAllBids() view returns (tuple(uint256 totalAmount, string urlString, tuple(address contributor, uint256 amount, uint256 timestamp)[] contributions)[])",
                    "function getBidderName(address _bidder) view returns (string)"
                ], provider);

                const rawBids = await contract.getAllBids();

                this.bids = await Promise.all(rawBids.map(async (bid) => {
                    const creatorAddr = bid.contributions[0].contributor;
                    const url = bid.urlString;

                    // 1. Get Bidder Name from Contract
                    let bidderName = "Anonymous";
                    try {
                        bidderName = await contract.getBidderName(creatorAddr);
                    } catch (e) { console.error("Name fetch failed"); }

                    return {
                        url: url,
                        amount: Number(bid.totalAmount),
                        bidderName: bidderName || "Anonymous",
                        bidderWallet: creatorAddr,
                        projectTitle: "Loading...", // Set in next step
                        hasRead: false,
                        claiming: false,
                        claimed: false
                    };
                }));

                // Sort by amount
                this.bids.sort((a, b) => b.amount - a.amount);
                this.loading = false;

                // 2. Fetch Website Titles (OpenGraph) in background
                this.fetchProjectTitles();

            } catch (err) {
                console.error("Load failed:", err);
                this.loading = false;
            }
        },

        async fetchProjectTitles() {
            this.bids.forEach(async (bid) => {
                try {
                    const res = await fetch(`/api/get-title?url=${encodeURIComponent(bid.url)}`);
                    const data = await res.json();
                    bid.projectTitle = data.title;
                } catch (e) {
                    bid.projectTitle = "Project Spotlight";
                }
            });
        },

        openReader(bid) {
            this.activeBid = bid;
            this.readerOpen = true;
            this.canFinish = false;
            this.countdown = 7;
            const timer = setInterval(() => {
                this.countdown--;
                if (this.countdown <= 0) {
                    this.canFinish = true;
                    clearInterval(timer);
                }
            }, 1000);
        }
    }));
});