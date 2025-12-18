document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: 'anonymous', pfp: '', wallet: '', loggedIn: false },
        bids: [],
        loading: true,
        contractAddress: '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da',
        
        // UI states
        readerOpen: false,
        editorOpen: false,
        activeBid: null,
        activeFacts: '',
        editableContent: '',
        canFinish: false,
        countdown: 7,

        async init() {
            try {
                // Initialize Farcaster Mini App SDK
                if (window.farcaster?.miniapp) {
                    const context = await window.farcaster.miniapp.getContext();
                    this.user = { 
                        username: context.user.username, 
                        pfp: context.user.pfpUrl, 
                        wallet: context.user.custodyAddress.toLowerCase(),
                        loggedIn: true 
                    };
                    // FIXED: Signal SDK that app is ready to hide splash screen
                    if (window.farcaster.miniapp.sdk?.actions) {
                        window.farcaster.miniapp.sdk.actions.ready();
                    }
                }
            } catch (e) { console.error("SDK Init failed", e); }
            
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
                this.bids = rawBids.map(bid => ({
                    url: bid.urlString,
                    amount: Number(bid.totalAmount),
                    bidderName: "...",
                    bidderWallet: bid.contributions[0].contributor.toLowerCase(),
                    projectTitle: "Loading...",
                    hasRead: false
                }));

                this.bids.sort((a, b) => b.amount - a.amount);
                this.loading = false;
                this.resolveMetadata(contract);
            } catch (err) { this.loading = false; }
        },

        async resolveMetadata(contract) {
            const addresses = this.bids.map(b => b.bidderWallet);
            let neynarMap = {};
            try {
                const nRes = await fetch(`/api/lookup-names?addresses=${addresses.join(',')}`);
                neynarMap = await nRes.json();
            } catch (e) {}

            for (let bid of this.bids) {
                // FIXED: If it's the current user, use the context's username immediately
                if (this.user.wallet && bid.bidderWallet === this.user.wallet) {
                    bid.bidderName = "@" + this.user.username;
                } else {
                    try {
                        const onChainName = await contract.getBidderName(bid.bidderWallet);
                        bid.bidderName = (onChainName && onChainName.trim() !== "") ? onChainName : (neynarMap[bid.bidderWallet] ? "@" + neynarMap[bid.bidderWallet] : bid.bidderWallet.slice(0,6));
                    } catch (e) { bid.bidderName = bid.bidderWallet.slice(0,6); }
                }

                fetch(`/api/get-title?url=${encodeURIComponent(bid.url)}`)
                    .then(res => res.json()).then(data => { bid.projectTitle = data.title; });
            }
        },

        async claimReward(bid) {
            if (!bid.hasRead) return;
            try {
                const res = await fetch('/api/claim', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wallet: this.user.wallet })
                });
                const data = await res.json();
                if (data.success) {
                    alert(`Claimed ${data.amount.toLocaleString()} $FACTS!`);
                } else {
                    alert(data.error || "Claim failed");
                }
            } catch (e) { alert("Error during claim."); }
        },

        // isOwner helper for UI
        isOwner(bid) {
            return this.user.wallet && bid.bidderWallet === this.user.wallet;
        },
        
        // ... (openReader, openEditor, saveFacts from previous steps)
    }));
});