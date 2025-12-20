import { neon, Pool } from '@neondatabase/serverless';

const DEFAULT_CLAIM_AMOUNT = Number(process.env.DEFAULT_CLAIM_AMOUNT || 250000);

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

        // 2. Resolve fid if available and set default claim amount (skip Neynar score checks for now)
        let resolvedFid = fid || null;
        if (!resolvedFid) {
            const dbUser = await sql`SELECT fid FROM users WHERE lower(wallet_address) = ${userWallet} LIMIT 1`;
            if (dbUser?.length) resolvedFid = dbUser[0].fid || null;
        }

        const amount = Number(process.env.DEFAULT_CLAIM_AMOUNT || DEFAULT_CLAIM_AMOUNT); // default to 250k for everyone

        // 3. Send $FACTS from master wallet (dynamic import of ethers to avoid module load failures)
        if (!process.env.REWARDER_PRIVATE_KEY) return res.status(500).json({ error: 'REWARDER_PRIVATE_KEY not configured' });
        if (!process.env.FACTS_TOKEN_ADDRESS) return res.status(500).json({ error: 'FACTS_TOKEN_ADDRESS not configured' });

        let ethersPkg;
        try {
            ethersPkg = await import('ethers');
        } catch (e) {
            console.error('claims: failed to import ethers', e);
            return res.status(500).json({ error: 'Server misconfigured: ethers dependency missing' });
        }

        const { Contract, Wallet, providers, parseUnits } = ethersPkg;
        const provider = new providers.JsonRpcProvider(process.env.RPC_URL || 'https://mainnet.base.org');
        const signer = new Wallet(process.env.REWARDER_PRIVATE_KEY, provider);
        const token = new Contract(process.env.FACTS_TOKEN_ADDRESS, ["function transfer(address to, uint256 amount) returns (bool)"], signer);
        
        const tx = await token.transfer(userWallet, parseUnits(String(amount), 18));
        await tx.wait();

        // 4. Log Claim (include fid and url for audit)
        await sql`INSERT INTO facts_claims (wallet_address, fid, url_string, amount) VALUES (${userWallet}, ${resolvedFid || null}, ${url}, ${amount})`;

        return res.status(200).json({ message: `Success! Sent ${amount} $FACTS` });
    } catch (e) {
        console.error('claims error', e);
        return res.status(500).json({ error: e.message });
    }
}