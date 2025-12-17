import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { title, article, ca, url, fid } = req.body;

    try {
        await pool.query(`
            INSERT INTO articles (url_string, submitted_by_fid, title, content, token_ca)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (url_string) DO UPDATE SET
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                token_ca = EXCLUDED.token_ca,
                submitted_by_fid = EXCLUDED.submitted_by_fid,
                updated_at = NOW()
        `, [url, fid, title, article, ca]);

        res.status(200).json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database save failed' });
    }
}