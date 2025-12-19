import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    const { url } = req.query;
    if (!url) return res.status(400).json({ content: "" });

    try {
        const sql = neon(process.env.DATABASE_URL);
        const result = await sql`SELECT content, bidder_wallet FROM project_facts WHERE urlString = ${url} LIMIT 1`;
        
        if (result.length > 0) {
            const row = result[0];
            // Try to resolve owner fid/username if bidder_wallet is set
            let ownerFid = null, ownerUsername = null;
            if (row.bidder_wallet) {
                const owner = await sql`SELECT fid, username FROM users WHERE wallet_address = ${row.bidder_wallet.toLowerCase()} LIMIT 1`;
                if (owner?.length) { ownerFid = owner[0].fid; ownerUsername = owner[0].username; }
            }

            return res.status(200).json({ content: row.content, bidder_wallet: row.bidder_wallet || null, ownerFid, ownerUsername });
        } else {
            return res.status(200).json({ content: "The bidder has not provided any specific facts for this project yet.", bidder_wallet: null, ownerFid: null, ownerUsername: null });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}