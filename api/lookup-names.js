export default async function handler(req, res) {
    const { addresses } = req.query;
    if (!addresses) return res.status(200).json({});

    try {
        const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addresses}`, {
            headers: { api_key: process.env.NEYNAR_API_KEY }
        });
        
        const data = await response.json();
        const mapping = {};
        
        // IMPORTANT: The Neynar response data keys are the addresses
        Object.keys(data).forEach(addr => {
            if (data[addr] && data[addr].length > 0) {
                // Force keys to lowercase to match the frontend mapping logic
                mapping[addr.toLowerCase()] = data[addr][0].username;
            }
        });

        res.status(200).json(mapping);
    } catch (e) {
        res.status(500).json({ error: 'Neynar lookup failed' });
    }
}