document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        // User State
        user: { 
            username: 'anonymous', 
            pfp: 'https://me-qr.com/static/img/default-pfp.png', 
            wallet: '', 
            score: 0, 
            loggedIn: false 
        },

        // Auction State
        bids: [],
        loading: true,
        contractAddress: '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da',

        // Reader/Modal State
        readerOpen: false,
        activeBid: null,
        canFinish: false,
        countdown: 7,
        timerStarted: false,
        
        // Edit Form State
        editModalOpen: false,
        form: { title: '', article: '', ca: '' },

        async init() {
            // 1. Initialize Farcaster SDK
            try {
                if (window.farcaster?.miniapp) {
                    const context = await window.farcaster.miniapp.getContext();
                    this.user.username = context.user.username;
                    this.user.pfp = context.user.pfpUrl;
                    this.user.wallet = context.user.custodyAddress;
                    this.user.loggedIn = true;
                }
            } catch (e) {
                console.warn("Farcaster context not found, running in browser mode.");
            }

            // 2. Load Auction Data
            await this.loadBids();
        },

        async loadBids() {
            this.loading = true;
            try {
                // Using Base Mainnet
                const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
                
                // ABI specifically handling your storage structure and name mapping
                const abi = [
                    "function getAllBids() view returns (tuple(uint256 totalAmount, string urlString, tuple(address contributor, uint256 amount, uint256 timestamp)[] contributions)[])",
                    "function getBidderName(address _bidder) view returns (string)",
                    "function auction() view returns (tuple(uint256 tokenId, uint256 startTime, uint256 endTime, bool settled, tuple(string urlString, uint256 validUntil) qrMetadata))"
                ];
                
                const contract = new ethers.Contract(this.contractAddress, abi, provider);
                
                // Fetch bids from contract
                const rawBids = await contract.getAllBids();

                // Process each bid and resolve names
                this.bids = await Promise.all(rawBids.map(async (bid) => {
                    const creatorAddr = bid.contributions[0].contributor;
                    
                    // Fetch the string name from the contract's mapping
                    let onChainName = "Unnamed Project";
                    try {
                        onChainName = await contract.getBidderName(creatorAddr);
                    } catch (e) {}

                    return {
                        url: bid.urlString,
                        amount: Number(bid.totalAmount),
                        projectName: onChainName || "Unnamed Project",
                        creatorAddress: creatorAddr.toLowerCase(),
                        creatorUsername: creatorAddr.slice(0, 6) + '...', // Initial fallback
                        hasRead: false,
                        claiming: false,
                        claimed: false,
                        // Placeholder for the "Facts" content (can be pulled from your DB)
                        fact: { title: '', article: '' } 
                    };
                }));

                // Sort by total USDC amount
                this.bids.sort((a, b) => b.amount - a.amount);

                // Now resolve Farcaster handles via your API
                await this.resolveUsernames();
                // Optionally: Load saved "Facts" for these URLs from your database
                await this.loadProjectFacts();

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
                const res = await fetch(`/api/lookup-names?addresses=${addresses}`);
                const nameMap = await res.json();
                
                this.bids.forEach(bid => {
                    if (nameMap[bid.creatorAddress]) {
                        bid.creatorUsername = nameMap[bid.creatorAddress];
                    }
                });
            } catch (e) {
                console.warn("Username resolution unavailable.");
            }
        },

        // --- Reader Logic ---
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

        // --- Claim Logic ---
        async claim(bid) {
            bid.claiming = true;
            // Simulated transaction/API call to your backend
            setTimeout(() => {
                bid.claiming = false;
                bid.claimed = true;
                this.user.score += 10;
            }, 2000);
        },

        // --- Edit Logic ---
        isMyBid(bid) {
            if (!this.user.wallet) return false;
            return bid.creatorAddress.toLowerCase() === this.user.wallet.toLowerCase();
        },

        openEditModal(bid) {
            this.activeBid = bid;
            this.form = { ...bid.fact };
            this.editModalOpen = true;
        },

        async submitFact() {
            // Save to your database via API
            this.activeBid.fact = { ...this.form };
            this.editModalOpen = false;
            alert("Facts updated locally!");
        },

        async loadProjectFacts() {
            // Placeholder: Fetch saved descriptions for each URL from your Vercel/Supabase DB
            console.log("Loading facts from DB...");
        }
    }));
});