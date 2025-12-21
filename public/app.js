// Import the SDK directly as per Farcaster docs
import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk';

document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: { username: 'anonymous', pfp: '', wallet: '', fid: 0, loggedIn: false },
        bids: [],
        loading: true,
        // ... UI states ...
        readerOpen: false,
        editorOpen: false,
        activeBid: null,
        activeFacts: '',
        editableContent: '',
        canFinish: false,
        countdown: 7,

        async init() {
            // 1. IMMEDIATELY call ready as per docs to hide splash screen
            // We do this before the heavy async sync/context logic
            sdk.actions.ready();

            try {
                // 2. Fetch context using the imported sdk object
                const context = await sdk.context;

                if (context?.user) {
                    const custody = context.user.custodyAddress;
                    const wallet = custody ? custody.toLowerCase() : null;
                    
                    this.user = {
                        username: context.user.username || 'anonymous',
                        pfp: context.user.pfpUrl || '',
                        wallet: wallet,
                        fid: context.user.fid,
                        loggedIn: true
                    };

                    // 3. Sync User to Neon DB in the background
                    this.syncUser();
                } else {
                    // Fallback for QuickAuth if context is missing
                    this.handleAuthorization();
                }
            } catch (e) {
                console.error('Farcaster SDK Context Error:', e);
            }

            // 4. Load Bids
            await this.loadBids();
        },

        async syncUser() {
            try {
                const r = await fetch('/api/sync-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.user)
                });
                if (!r.ok) console.warn('sync-user failed', await r.json());
            } catch (e) { 
                console.error('sync-user request failed', e); 
            }
        },

        async handleAuthorization() {
            try {
                if (sdk.actions.authorize) {
                    await sdk.actions.authorize();
                    const newCtx = await sdk.context;
                    if (newCtx?.user) {
                        this.user = {
                            username: newCtx.user.username || 'anonymous',
                            pfp: newCtx.user.pfpUrl || '',
                            wallet: newCtx.user.custodyAddress?.toLowerCase(),
                            fid: newCtx.user.fid,
                            loggedIn: true
                        };
                        this.syncUser();
                    }
                }
            } catch (e) { 
                console.warn('Authorization failed', e); 
            }
        },

        async loadBids() {
            this.loading = true;
            try {
                // Use the provider and contract logic here
                // Note: Ensure ethers is loaded in your HTML
                const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
                const contract = new ethers.Contract('0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da', [
                    "function getAllBids() view returns (tuple(uint256 totalAmount, string urlString, tuple(address contributor, uint256 amount, uint256 timestamp)[] contributions)[])"
                ], provider);

                const rawBids = await contract.getAllBids();
                this.bids = rawBids.map(bid => ({
                    url: bid.urlString,
                    amount: Number(bid.totalAmount),
                    bidderWallet: bid.contributions[0].contributor.toLowerCase(),
                    projectTitle: "Loading...",
                    bidderName: bid.contributions[0].contributor.slice(0, 6),
                    hasRead: false,
                    hasClaimed: false,
                    claimedAmount: null,
                    claimTx: null
                }));
                
                this.bids.sort((a, b) => b.amount - a.amount);
            } catch (e) {
                console.error("Load Bids Error:", e);
            } finally {
                this.loading = false;
            }
        },

        async claim(bid) {
            console.debug('claim invoked', { bid, user: this.user });
            if (!this.user.loggedIn) return alert("Please log in via Farcaster");
            if (!bid.hasRead) return alert('Please review the facts before claiming.');
            if (!bid.hasFacts) return alert('No facts to claim for this project.');
            try {
                const res = await fetch('/api/claims', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wallet: this.user.wallet, fid: this.user.fid, url: bid.url })
                });
                const data = await res.json();
                console.debug('claim response', { status: res.status, data });
                if (res.ok) {
                    bid.claimedAmount = data.amount || 250000;
                    bid.claimTx = data.txHash || null;
                    bid.hasClaimed = true;
                    // force reactivity
                    this.bids = [...this.bids];
                    alert(data.message ? (data.message + (data.txHash ? ' Tx: ' + data.txHash : '')) : 'Claim successful');
                } else {
                    alert(data.error || 'Claim failed');
                }
            } catch (e) { 
                console.error('claim exception', e); 
                alert('Claim failed: ' + e.message); 
            }
        }
    }));
});