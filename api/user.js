import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { fid, wallet, username, pfp, score } = req.body;

    await pool.query(`
        INSERT INTO users (fid, wallet_address, username, pfp_url, neynar_score, last_score_update)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (fid) DO UPDATE SET
            wallet_address = EXCLUDED.wallet_address,
            username = EXCLUDED.username,
            pfp_url = EXCLUDED.pfp_url,
            neynar_score = EXCLUDED.neynar_score,
            last_score_update = NOW(),
            updated_at = NOW()
    `, [fid, wallet, username, pfp, score]);

    res.status(200).json({ success: true });
}

export const config = { api: { bodyParser: true } };