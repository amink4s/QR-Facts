export default async function handler(req, res) {
    const { address } = req.query;
    try {
        const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk_by_address?addresses=${address}`, {
            headers: { 'api_key': process.env.NEYNAR_API_KEY }
        });
        const data = await response.json();
        const username = data[address.toLowerCase()]?.[0]?.username;
        res.status(200).json({ username });
    } catch (e) {
        res.status(200).json({ username: null });
    }
}