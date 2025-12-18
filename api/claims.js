import { neon } from '@neondatabase/serverless';
import { ethers } from 'ethers';

export default async function handler(req, res) {
    const { wallet } = req.body;
    const userWallet = wallet.toLowerCase();

    try {
        const sql = neon(process.env.DATABASE_URL);

        // 1. Check Daily Limit
        const today = await sql`SELECT * FROM facts_claims WHERE wallet_address = ${userWallet} AND claim_date = CURRENT_DATE`;
        if (today.length > 0) return res.status(400).json({ error: "Already claimed today!" });

        // 2. Check Neynar Score via API
        const neynarRes = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk_by_address?addresses=${userWallet}`, {
            headers: { 'api_key': process.env.NEYNAR_API_KEY }
        });
        const neynarData = await neynarRes.json();
        const score = neynarData[userWallet]?.[0]?.neynar_user_score || 0;

        let amount = 0;
        if (score >= 0.9) amount = 500000;
        else if (score >= 0.6) amount = 250000;
        else return res.status(403).json({ error: "Neynar score too low to claim." });

        // 3. Send $FACTS from master wallet
        const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
        const signer = ethers.Wallet.fromPhrase(process.env.SEED_PHRASE, provider);
        const token = new ethers.Contract(process.env.FACTS_TOKEN_ADDRESS, ["function transfer(address to, uint256 amount) returns (bool)"], signer);
        
        const tx = await token.transfer(userWallet, ethers.parseUnits(amount.toString(), 18));
        await tx.wait();

        // 4. Log Claim
        await sql`INSERT INTO facts_claims (wallet_address, amount) VALUES (${userWallet}, ${amount})`;

        return res.status(200).json({ message: `Success! Sent ${amount} $FACTS` });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}