import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    // 1. Check if the connection string exists
    if (!process.env.DATABASE_URL) {
        return res.status(500).json({ error: "DATABASE_URL is not set in Vercel" });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // 2. Attempt the query
        // Note: Make sure you ran the SQL to create the 'articles' table!
        const { rows } = await pool.query(`SELECT * FROM articles`);
        
        const formatted = rows.map(r => ({
            url_string: r.url_string,
            title: r.title,
            article: r.content,
            ca_or_link: r.token_ca
        }));

        res.status(200).json(formatted);
    } catch (e) {
        console.error("DATABASE_ERROR:", e.message);
        // This will now return JSON even if it fails, so app.js won't crash
        res.status(500).json({ 
            error: 'Database query failed', 
            details: e.message 
        });
    } finally {
        await pool.end();
    }
}