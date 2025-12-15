import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const fid = parseInt(req.query.fid || req.body.fid);

    if (req.method === 'GET') {
        const { rows } = await pool.query(`
            SELECT last_claim_date = CURRENT_DATE AS claimed_today 
            FROM users WHERE fid = $1
        `, [fid]);
        res.status(200).json(rows[0] || { claimedToday: false });
        return;
    }

    if (req.method === 'POST') {
        const { amount, score } = req.body;

        await pool.query(`
            UPDATE users SET claimed_today = claimed_today + $1, last_claim_date = CURRENT_DATE
            WHERE fid = $2
        `, [amount, fid]);

        // Insert log
        await pool.query(`
            INSERT INTO claims (fid, amount, neynar_score_at_claim)
            VALUES ($1, $2, $3)
        `, [fid, amount, score]);

        res.status(200).json({ success: true });
    }
}

export const config = { api: { bodyParser: true } };