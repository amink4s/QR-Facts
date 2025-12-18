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
                
                // Process basic bid data
                this.bids = rawBids.map(bid => ({
                    url: bid.urlString,
                    amount: Number(bid.totalAmount),
                    bidderName: "...", // Loading state
                    bidderWallet: bid.contributions[0].contributor,
                    projectTitle: "Loading...",
                    hasRead: false
                }));

                this.bids.sort((a, b) => b.amount - a.amount);
                this.loading = false;

                // Fire off background resolution
                this.resolveMetadata(contract);

            } catch (err) {
                console.error("Load failed:", err);
                this.loading = false;
            }
        },

        async resolveMetadata(contract) {
            // 1. Resolve Bidder Names (Contract then Neynar)
            const addresses = this.bids.map(b => b.bidderWallet);
            
            // Fetch Neynar usernames in bulk for the fallback
            let neynarMap = {};
            try {
                const nRes = await fetch(`/api/lookup-names?addresses=${addresses.join(',')}`);
                neynarMap = await nRes.json();
            } catch (e) { console.warn("Neynar fallback unavailable"); }

            for (let bid of this.bids) {
                try {
                    // Try Contract first (Matches X users / custom names)
                    const onChainName = await contract.getBidderName(bid.bidderWallet);
                    
                    if (onChainName && onChainName.trim() !== "") {
                        bid.bidderName = onChainName;
                    } else if (neynarMap[bid.bidderWallet.toLowerCase()]) {
                        // Fallback to Farcaster username
                        bid.bidderName = "@" + neynarMap[bid.bidderWallet.toLowerCase()];
                    } else {
                        // Final Fallback to wallet snippet
                        bid.bidderName = bid.bidderWallet.slice(0, 6);
                    }
                } catch (e) { bid.bidderName = bid.bidderWallet.slice(0, 6); }

                // 2. Resolve Project Titles
                fetch(`/api/get-title?url=${encodeURIComponent(bid.url)}`)
                    .then(res => res.json())
                    .then(data => { bid.projectTitle = data.title; })
                    .catch(() => { bid.projectTitle = "Project Spotlight"; });
            }
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