import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { fid } = req.query;

    if (!fid) return res.status(400).json({ error: 'FID required' });

    try {
        // Find all project URLs this user has already claimed
        const { rows } = await pool.query(
            'SELECT url_string FROM claims WHERE fid = $1',
            [fid]
        );
        
        // Return just an array of URLs for easy matching on the frontend
        const claimedUrls = rows.map(r => r.url_string);
        res.status(200).json({ claimedUrls });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch claim status' });
    }
}