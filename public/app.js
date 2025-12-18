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

                // Process each bid one by one to ensure bidder names are fetched
                const processedBids = [];
                for (let bid of rawBids) {
                    const creatorAddr = bid.contributions[0].contributor;
                    const url = bid.urlString;

                    let bidderName = "Anonymous";
                    try {
                        // Ensure address is formatted correctly for the call
                        const name = await contract.getBidderName(ethers.getAddress(creatorAddr));
                        if (name && name.trim() !== "") {
                            bidderName = name;
                        }
                    } catch (e) { 
                        console.error("Bidder name fetch failed for:", creatorAddr, e); 
                    }

                    processedBids.push({
                        url: url,
                        amount: Number(bid.totalAmount),
                        bidderName: bidderName,
                        bidderWallet: creatorAddr,
                        projectTitle: "Loading Title...", 
                        hasRead: false,
                        claiming: false,
                        claimed: false
                    });
                }

                this.bids = processedBids;
                this.bids.sort((a, b) => b.amount - a.amount);
                this.loading = false;

                // Background: Fetch Titles
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
                    bid.projectTitle = "View Project";
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