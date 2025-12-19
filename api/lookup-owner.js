import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address required' });

    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL not configured' });

    try {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        const r = await pool.query(`SELECT fid, username, pfp_url FROM users WHERE wallet_address = $1 LIMIT 1`, [address.toLowerCase()]);
        if (r.rowCount === 0) return res.status(200).json({ fid: null, username: null, pfp: null });
        const row = r.rows[0];
        res.status(200).json({ fid: row.fid, username: row.username, pfp: row.pfp_url });
    } catch (e) {
        console.error('lookup-owner error', e);
        res.status(500).json({ error: e.message });
    }
}

export const config = { api: { bodyParser: false } };