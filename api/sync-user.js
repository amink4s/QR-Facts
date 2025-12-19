import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const { fid, username, pfp, wallet } = req.body;

    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL not configured' });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        await pool.query(`
            INSERT INTO users (fid, wallet_address, username, pfp_url, last_seen)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (fid) DO UPDATE SET
                wallet_address = EXCLUDED.wallet_address,
                username = EXCLUDED.username,
                pfp_url = EXCLUDED.pfp_url,
                last_seen = NOW(),
                updated_at = NOW()
        `, [fid, wallet?.toLowerCase(), username, pfp]);

        res.status(200).json({ success: true });
    } catch (e) {
        console.error('sync-user error', e);
        res.status(500).json({ error: e.message });
    }
}

export const config = { api: { bodyParser: true } };