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
            } catch (e) { console.warn("SDK Context Error"); }
            await this.loadBids();
        },

        async loadBids() {
            this.loading = true;
            try {
                const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
                
                // Optimized ABI to ensure we hit the explicit getter
                const abi = [
                    "function getAllBids() view returns (tuple(uint256 totalAmount, string urlString, tuple(address contributor, uint256 amount, uint256 timestamp)[] contributions)[])",
                    "function getBidderName(address _bidder) view returns (string)"
                ];
                
                const contract = new ethers.Contract(this.contractAddress, abi, provider);
                const rawBids = await contract.getAllBids();

                this.bids = await Promise.all(rawBids.map(async (bid) => {
                    const creatorAddr = bid.contributions[0].contributor;
                    
                    // CALLING THE EXPLICIT GETTER
                    let nameResult = "Unnamed Project";
                    try {
                        const fetchedName = await contract.getBidderName(creatorAddr);
                        if (fetchedName && fetchedName !== "") {
                            nameResult = fetchedName;
                        }
                    } catch (e) { console.error("Getter failed for", creatorAddr, e); }

                    return {
                        url: bid.urlString,
                        amount: Number(bid.totalAmount),
                        projectName: nameResult,
                        creatorAddress: creatorAddr.toLowerCase(),
                        creatorUsername: creatorAddr.slice(0, 6) + '...' + creatorAddr.slice(-4), 
                        hasRead: false,
                        claiming: false,
                        claimed: false,
                        fact: { title: '', article: '' } 
                    };
                }));

                this.bids.sort((a, b) => b.amount - a.amount);
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
                // IMPORTANT: This URL must point to your Vercel API
                const res = await fetch(`/api/lookup-names?addresses=${addresses}`);
                const nameMap = await res.json();
                
                // Update bids with the Farcaster handle if found
                this.bids = this.bids.map(bid => {
                    const handle = nameMap[bid.creatorAddress.toLowerCase()];
                    return {
                        ...bid,
                        creatorUsername: handle ? handle : bid.creatorUsername
                    };
                });
            } catch (e) { console.warn("Neynar resolution failed"); }
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
            }, 2000);
        },

        isMyBid(bid) {
            if (!this.user.wallet) return false;
            return bid.creatorAddress === this.user.wallet.toLowerCase();
        },

        openEditModal(bid) {
            this.activeBid = bid;
            this.form = { ...bid.fact };
            this.editModalOpen = true;
        },

        async submitFact() {
            this.activeBid.fact = { ...this.form };
            this.editModalOpen = false;
        }
    }));
});