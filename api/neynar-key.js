export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    
    const key = process.env.NEYNAR_API_KEY;
    if (!key) return res.status(500).json({ error: 'API key not configured' });
    
    res.status(200).json({ key });
}

export const config = { api: { bodyParser: false } };