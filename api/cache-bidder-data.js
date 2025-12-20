import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { bidderWallet, bidderName, bidderFid } = req.body;

        if (!bidderWallet) {
            return res.status(400).json({ error: 'bidderWallet is required' });
        }

        try {
            const sql = neon(process.env.DATABASE_URL);
            const lowerWallet = bidderWallet.toLowerCase();

            // Upsert into bidder_cache table
            await sql`
                INSERT INTO bidder_cache (wallet_address, bidder_name, bidder_fid, last_updated)
                VALUES (${lowerWallet}, ${bidderName || null}, ${bidderFid || null}, NOW())
                ON CONFLICT (wallet_address) DO UPDATE SET
                    bidder_name = ${bidderName || null},
                    bidder_fid = ${bidderFid || null},
                    last_updated = NOW()
            `;

            return res.status(200).json({ success: true });
        } catch (e) {
            console.error('cache-bidder-data error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    } else if (req.method === 'GET') {
        const { wallet } = req.query;

        if (!wallet) {
            return res.status(400).json({ error: 'wallet query param is required' });
        }

        try {
            const sql = neon(process.env.DATABASE_URL);
            const result = await sql`
                SELECT bidder_name, bidder_fid, last_updated FROM bidder_cache
                WHERE wallet_address = ${wallet.toLowerCase()}
                LIMIT 1
            `;

            if (result.length > 0) {
                return res.status(200).json(result[0]);
            } else {
                return res.status(404).json({ error: 'Not found' });
            }
        } catch (e) {
            console.error('cache-bidder-data error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
