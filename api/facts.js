import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // We select from 'articles' which matches the new SQL schema
        const { rows } = await pool.query(`SELECT * FROM articles`);
        
        // Map database columns to the frontend format
        const formatted = rows.map(r => ({
            url_string: r.url_string,
            title: r.title,
            article: r.content,
            ca_or_link: r.token_ca
        }));

        res.status(200).json(formatted);
    } catch (e) {
        console.error("Database Error:", e);
        res.status(500).json({ error: 'Failed to fetch facts from database' });
    }
}