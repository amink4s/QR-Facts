import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { url, content, wallet } = req.body;

    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL not configured' });

    try {
        const sql = neon(process.env.DATABASE_URL);

        // Attempt to insert or update only if the caller is the owner (bidder_wallet)
        const result = await sql`
            INSERT INTO project_facts (url_hash, urlString, bidder_wallet, content, updated_at)
            VALUES (encode(digest(${url}, 'sha256'), 'hex'), ${url}, ${wallet.toLowerCase()}, ${content}, NOW())
            ON CONFLICT (url_hash) 
            DO UPDATE SET content = ${content}, updated_at = NOW()
            WHERE project_facts.bidder_wallet = ${wallet.toLowerCase()}
            RETURNING *;
        `;

        // If no rows returned, either the URL existed and the caller is not the owner, or something else went wrong
        if (!result || result.length === 0) {
            return res.status(403).json({ error: 'Unauthorized: only the original bidder may create or update facts for this project.' });
        }

        res.status(200).json({ success: true, row: result[0] });
    } catch (e) {
        console.error('save-facts error', e);
        res.status(500).json({ error: e.message });
    }
}

export const config = { api: { bodyParser: true } };