import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { fid, username, pfp, wallet } = req.body;
    
    try {
        const sql = neon(process.env.DATABASE_URL);
        await sql`
            INSERT INTO users (fid, username, pfp, wallet)
            VALUES (${fid}, ${username}, ${pfp}, ${wallet})
            ON CONFLICT (fid) DO UPDATE SET 
            username = ${username}, pfp = ${pfp}, wallet = ${wallet}, last_seen = NOW()
        `;
        return res.status(200).json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}