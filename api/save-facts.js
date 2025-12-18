import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    const { url, content, wallet } = req.body;

    try {
        const sql = neon(process.env.DATABASE_URL);
        
        // Upsert logic: Insert new or update if URL already exists
        await sql`
            INSERT INTO project_facts (url_hash, urlString, bidder_wallet, content, updated_at)
            VALUES (encode(digest(${url}, 'sha256'), 'hex'), ${url}, ${wallet.toLowerCase()}, ${content}, NOW())
            ON CONFLICT (url_hash) 
            DO UPDATE SET content = ${content}, updated_at = NOW()
            WHERE project_facts.bidder_wallet = ${wallet.toLowerCase()}
        `;

        res.status(200).json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}