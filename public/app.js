document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: 'anonymous', pfp: '', wallet: '', loggedIn: false },
        bids: [],
        loading: true,
        contractAddress: '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da',
        
        // UI States
        readerOpen: false,
        editorOpen: false,
        activeBid: null,
        activeFacts: '',
        editableContent: '',
        canFinish: false,
        countdown: 7,

        async init() {
            if (window.farcaster?.miniapp) {
                const context = await window.farcaster.miniapp.getContext();
                this.user = { 
                    username: context.user.username, 
                    pfp: context.user.pfpUrl, 
                    wallet: context.user.custodyAddress.toLowerCase(),
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
                // 1. Resolve Name
                try {
                    const onChainName = await contract.getBidderName(bid.bidderWallet);
                    bid.bidderName = (onChainName && onChainName.trim() !== "") ? onChainName : (neynarMap[bid.bidderWallet] ? "@" + neynarMap[bid.bidderWallet] : bid.bidderWallet.slice(0,6));
                } catch (e) { bid.bidderName = bid.bidderWallet.slice(0,6); }

                // 2. Resolve Title
                fetch(`/api/get-title?url=${encodeURIComponent(bid.url)}`)
                    .then(res => res.json()).then(data => { bid.projectTitle = data.title; });
            }
        },

        async openReader(bid) {
            this.activeBid = bid;
            this.activeFacts = "Loading facts...";
            this.readerOpen = true;
            this.canFinish = false;
            this.countdown = 7;

            // Fetch facts from Neon
            const res = await fetch(`/api/get-facts?url=${encodeURIComponent(bid.url)}`);
            const data = await res.json();
            this.activeFacts = data.content;

            const timer = setInterval(() => {
                this.countdown--;
                if (this.countdown <= 0) {
                    this.canFinish = true;
                    clearInterval(timer);
                }
            }, 1000);
        },

        openEditor(bid) {
            this.activeBid = bid;
            this.editableContent = ""; // Reset
            this.editorOpen = true;
            fetch(`/api/get-facts?url=${encodeURIComponent(bid.url)}`)
                .then(res => res.json())
                .then(data => { this.editableContent = data.content; });
        },

        async saveFacts() {
            const res = await fetch('/api/save-facts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: this.activeBid.url,
                    content: this.editableContent,
                    wallet: this.user.wallet
                })
            });
            if (res.ok) this.editorOpen = false;
        }
    }));
});