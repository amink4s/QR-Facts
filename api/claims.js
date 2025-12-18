import { neon } from '@neondatabase/serverless';
import { ethers } from 'ethers';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet } = req.body;
    const userWallet = wallet.toLowerCase();

    try {
        const sql = neon(process.env.DATABASE_URL);
        const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
        const masterWallet = ethers.Wallet.fromPhrase(process.env.SEED_PHRASE, provider);
        
        // 1. Check if user already claimed today
        const existingClaim = await sql`
            SELECT * FROM facts_claims 
            WHERE wallet_address = ${userWallet} AND claim_date = CURRENT_DATE
        `;
        if (existingClaim.length > 0) return res.status(403).json({ error: 'Already claimed today' });

        // 2. Fetch Neynar Score
        const neynarRes = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk_by_address?addresses=${userWallet}`, {
            headers: { 'api_key': process.env.NEYNAR_API_KEY }
        });
        const neynarData = await neynarRes.json();
        const score = neynarData[userWallet]?.[0]?.neynar_user_score || 0;

        // 3. Determine Reward Tier
        let amount = 0;
        if (score >= 0.9) amount = 500000;
        else if (score >= 0.6) amount = 250000;
        else return res.status(403).json({ error: `Score too low (${score.toFixed(2)})` });

        // 4. Send Transaction (ERC20 Transfer)
        const tokenAbi = ["function transfer(address to, uint256 amount) returns (bool)"];
        const tokenContract = new ethers.Contract(process.env.FACTS_TOKEN_ADDRESS, tokenAbi, masterWallet);
        
        // Assuming 18 decimals for $FACTS
        const tx = await tokenContract.transfer(userWallet, ethers.parseUnits(amount.toString(), 18));
        await tx.wait();

        // 5. Record claim in DB
        await sql`INSERT INTO facts_claims (wallet_address, amount) VALUES (${userWallet}, ${amount})`;

        return res.status(200).json({ success: true, amount, hash: tx.hash });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}