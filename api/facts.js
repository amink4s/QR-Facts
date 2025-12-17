import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // Fetch all articles. Since URL is unique, 
        // app.js will match these to the current auction bids.
        const { rows } = await pool.query(`SELECT * FROM articles`);
        
        // Map the database names to what app.js expects
        const formatted = rows.map(r => ({
            url_string: r.url_string,
            title: r.title,
            article: r.content,
            ca_or_link: r.token_ca
        }));

        res.status(200).json(formatted);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch facts' });
    }
}