import { neon, Pool } from '@neondatabase/serverless';
import { ethers } from 'ethers';

export default async function handler(req, res) {
    const { wallet, fid, url } = req.body;
    if ((!wallet && !fid) || !url) return res.status(400).json({ error: 'Missing wallet/fid or url' });
    const sql = neon(process.env.DATABASE_URL);
    let userWallet = wallet ? String(wallet).toLowerCase() : null;

    // If no wallet provided, try to resolve from fid in users table
    if (!userWallet && fid) {
        const owner = await sql`SELECT wallet_address FROM users WHERE fid = ${fid} LIMIT 1`;
        if (owner?.length && owner[0].wallet_address) {
            userWallet = owner[0].wallet_address.toLowerCase();
        } else {
            return res.status(400).json({ error: 'No wallet on file for provided fid' });
        }
    }

    try {
        const sql = neon(process.env.DATABASE_URL);

        // Ensure facts exist for the provided url
        const factsRow = await sql`SELECT content FROM project_facts WHERE urlString = ${url} LIMIT 1`;
        if (!factsRow || factsRow.length === 0) return res.status(400).json({ error: 'No facts to claim for this project.' });
        const content = factsRow[0].content || '';
        if (content.toLowerCase().includes('not provided') || content.trim().length < 10) {
            return res.status(400).json({ error: 'No facts to claim for this project.' });
        }

        // 1. Check Daily Limit (case-insensitive wallet match)
        const today = await sql`SELECT * FROM facts_claims WHERE lower(wallet_address) = ${userWallet} AND claim_date = CURRENT_DATE`;
        if (today.length > 0) return res.status(400).json({ error: "Already claimed today!" });

        // 2. Try DB first for stored Neynar score / fid
        let fid = null;
        let score = null;
        const dbUser = await sql`SELECT fid, neynar_score FROM users WHERE lower(wallet_address) = ${userWallet} LIMIT 1`;
        if (dbUser?.length && dbUser[0].neynar_score != null) {
            score = Number(dbUser[0].neynar_score);
            fid = dbUser[0].fid || null;
        } else {
            // Fallback: fetch Neynar
            try {
                const neynarRes = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${encodeURIComponent(userWallet)}`, {
                    headers: { 'x-api-key': process.env.NEYNAR_API_KEY || '' }
                });
                const neynarData = await neynarRes.json();
                const key = Object.keys(neynarData || {}).find(k => k.toLowerCase() === userWallet);
                const userObj = key ? neynarData[key]?.[0] : (Array.isArray(neynarData) ? neynarData[0] : null);
                score = Number(userObj?.neynar_user_score ?? userObj?.neynar_score ?? userObj?.score ?? 0);
                if (userObj?.fid) fid = userObj.fid;

                // Persist score/fid to users table where possible
                try {
                    if (fid) {
                        // Upsert by fid
                        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
                        await pool.query(`
                            INSERT INTO users (fid, wallet_address, username, pfp_url, neynar_score, last_score_update)
                            VALUES ($1, $2, $3, $4, $5, NOW())
                            ON CONFLICT (fid) DO UPDATE SET
                                wallet_address = COALESCE(EXCLUDED.wallet_address, users.wallet_address),
                                neynar_score = EXCLUDED.neynar_score,
                                last_score_update = NOW(),
                                updated_at = NOW()
                        `, [fid, userWallet, null, null, score]);
                    } else if (!isNaN(score)) {
                        await sql`UPDATE users SET neynar_score = ${score}, last_score_update = NOW() WHERE lower(wallet_address) = ${userWallet}`;
                    }
                } catch (e) { /* ignore cache/update failures */ }
            } catch (e) {
                console.debug('claims: Neynar lookup failed', e?.message || e);
            }
        }

        score = Number(score || 0);
        let amount = 0;
        if (score >= 0.9) amount = 500000;
        else if (score >= 0.6) amount = 250000;
        else return res.status(403).json({ error: "Neynar score too low to claim." });

        // 3. Send $FACTS from master wallet
        if (!process.env.REWARDER_PRIVATE_KEY) return res.status(500).json({ error: 'REWARDER_PRIVATE_KEY not configured' });
        if (!process.env.FACTS_TOKEN_ADDRESS) return res.status(500).json({ error: 'FACTS_TOKEN_ADDRESS not configured' });

        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://mainnet.base.org');
        const signer = new ethers.Wallet(process.env.REWARDER_PRIVATE_KEY, provider);
        const token = new ethers.Contract(process.env.FACTS_TOKEN_ADDRESS, ["function transfer(address to, uint256 amount) returns (bool)"], signer);
        
        const tx = await token.transfer(userWallet, ethers.parseUnits(String(amount), 18));
        await tx.wait();

        // 4. Log Claim (include fid and url for audit)
        await sql`INSERT INTO facts_claims (wallet_address, fid, url_string, amount) VALUES (${userWallet}, ${fid || null}, ${url}, ${amount})`;

        return res.status(200).json({ message: `Success! Sent ${amount} $FACTS` });
    } catch (e) {
        console.error('claims error', e);
        return res.status(500).json({ error: e.message });
    }
}