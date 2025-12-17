document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: '', pfp: '', wallet: '', loggedIn: false },
        bids: [],
        loading: true,
        contractAddress: '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da',

        async init() {
            // Give time for ethers to load if script is slow
            if (!window.ethers) {
                setTimeout(() => this.init(), 500);
                return;
            }
            await this.loadBids();
            this.checkLogin();
        },

        async loadBids() {
            this.loading = true;
            try {
                const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
                
                // We define the specific functions we need from your QRAuctionV4 contract
                const abi = [
                    "function getAllBids() view returns (tuple(uint256 totalAmount, string urlString, tuple(address contributor, uint256 amount, uint256 timestamp)[] contributions)[])",
                    "function getBidderName(address _bidder) view returns (string)"
                ];
                
                const contract = new ethers.Contract(this.contractAddress, abi, provider);
                const rawBids = await contract.getAllBids();

                // 1. Map the bids and call getBidderName for each unique address
                const processedBids = await Promise.all(rawBids.map(async (bid) => {
                    // The first contributor is the one who named the bid
                    const creatorAddr = bid.contributions[0].contributor;
                    
                    // Fetch the name string the user entered on-chain
                    let onChainName = "Unnamed Project";
                    try {
                        onChainName = await contract.getBidderName(creatorAddr);
                    } catch (e) { console.error("Name fetch error", e); }

                    return {
                        url: bid.urlString,
                        amount: Number(bid.totalAmount),
                        projectName: onChainName || "Unnamed Project",
                        creatorAddress: creatorAddr.toLowerCase(),
                        creatorUsername: creatorAddr.slice(0, 6) + '...', // Temporary fallback
                        contributions: bid.contributions
                    };
                }));

                // Sort by highest amount first
                this.bids = processedBids.sort((a, b) => b.amount - a.amount);

                // 2. Fetch Farcaster handles for all creators via our API
                await this.resolveUsernames();

            } catch (error) {
                console.error('Failed to load bids:', error);
            } finally {
                this.loading = false;
            }
        },

        async resolveUsernames() {
            // Get unique addresses from the creators
            const addresses = [...new Set(this.bids.map(b => b.creatorAddress))].join(',');
            if (!addresses) return;

            try {
                // This calls your /api/lookup-names.js which uses Neynar
                const res = await fetch(`/api/lookup-names?addresses=${addresses}`);
                const nameMap = await res.json();
                
                this.bids = this.bids.map(bid => ({
                    ...bid,
                    creatorUsername: nameMap[bid.creatorAddress] || bid.creatorUsername
                }));
            } catch (e) {
                console.warn("Neynar username resolution failed.");
            }
        },

        // --- FARCASTER LOGIN LOGIC ---
        async login() {
            // Trigger your Farcaster login flow here (SIWN / Neynar Auth)
            // This is a placeholder for your existing login mechanism
            console.log("Login triggered");
        },

        checkLogin() {
            // Logic to check if user is already logged in (LocalStorage/Cookie)
            const saved = localStorage.getItem('fc_user');
            if (saved) {
                this.user = JSON.parse(saved);
                this.user.loggedIn = true;
            }
        }
    }));
});