import { Pool } from '@neondatabase/serverless';
import { createWalletClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const FACTS_CA = '0x97fad6f41377eb5a530e9652818a3deb31d12b07';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { fid, url, wallet, score } = req.body;

    // 1. Determine Reward
    let rewardAmount = "0";
    if (score >= 0.9) rewardAmount = "500000";
    else if (score >= 0.6) rewardAmount = "250000";
    else return res.status(403).json({ error: 'Neynar score too low' });

    try {
        // 2. Double-claim check
        const check = await pool.query('SELECT id FROM claims WHERE fid = $1 AND url_string = $2', [fid, url]);
        if (check.rows.length > 0) return res.status(400).json({ error: 'Already claimed for this bid' });

        // 3. Send Tokens via Base
        const account = privateKeyToAccount(process.env.REWARDER_PRIVATE_KEY);
        const client = createWalletClient({ 
            account, 
            chain: base, 
            transport: http('https://mainnet.base.org') 
        });

        const hash = await client.writeContract({
            address: FACTS_CA,
            abi: [{"inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}],
            functionName: 'transfer',
            args: [wallet, parseUnits(rewardAmount, 18)]
        });

        // 4. Log to DB
        await pool.query(
            'INSERT INTO claims (fid, url_string, amount) VALUES ($1, $2, $3)',
            [fid, url, rewardAmount]
        );

        res.status(200).json({ success: true, txHash: hash });
    } catch (e) {
        console.error("Claim Error:", e);
        res.status(500).json({ error: e.message || 'Transaction failed' });
    }
}