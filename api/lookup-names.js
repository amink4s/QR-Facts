// api/lookup-names.js
export default async function handler(req, res) {
    const { addresses } = req.query; // Expects comma-separated list
    if (!addresses) return res.status(400).json({ error: 'Addresses required' });

    try {
        const keyRes = await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000'}/api/neynar-key`);
        const { key } = await keyRes.json();

        // Neynar bulk lookup by address
        const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addresses}`, {
            headers: { api_key: key }
        });
        
        const data = await response.json();
        // Returns a map of address -> username
        const mapping = {};
        Object.entries(data).forEach(([addr, users]) => {
            if (users && users.length > 0) {
                mapping[addr.toLowerCase()] = users[0].username;
            }
        });

        res.status(200).json(mapping);
    } catch (e) {
        res.status(500).json({ error: 'Lookup failed' });
    }
}