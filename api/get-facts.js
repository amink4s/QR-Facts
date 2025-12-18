import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    const { url } = req.query;
    if (!url) return res.status(400).json({ content: "" });

    try {
        const sql = neon(process.env.DATABASE_URL);
        const result = await sql`SELECT content FROM project_facts WHERE urlString = ${url} LIMIT 1`;
        
        if (result.length > 0) {
            return res.status(200).json({ content: result[0].content });
        } else {
            return res.status(200).json({ content: "The bidder has not provided any specific facts for this project yet." });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}