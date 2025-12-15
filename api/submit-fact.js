import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { title, article, ca, url, fid } = req.body;

    // Basic verification — check if user is bidder (optional extra security)
    await pool.query(`
        INSERT INTO spotlights (url_string, title, article, ca_or_link, submitted_by_fid, auction_date, approved)
        VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, true)
        ON CONFLICT (auction_date, url_string) DO UPDATE SET
            title = EXCLUDED.title,
            article = EXCLUDED.article,
            ca_or_link = EXCLUDED.ca_or_link,
            submitted_by_fid = EXCLUDED.submitted_by_fid
    `, [url, title, article, ca, fid]);

    res.status(200).json({ success: true });
}

export const config = { api: { bodyParser: true } };