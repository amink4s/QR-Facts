export default async function handler(req, res) {
    const { url } = req.query;
    if (!url) return res.status(400).json({ title: "No URL" });

    // Handle Farcaster links without scraping
    if (url.includes('warpcast.com/~/apps/')) {
        const parts = url.split('/');
        const appName = parts[parts.length - 1].replace(/-/g, ' ');
        return res.status(200).json({ title: appName.toUpperCase() + " (Mini-App)" });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const text = await response.text();
        
        const ogTitleMatch = text.match(/<meta property="og:title" content="(.*?)"/i);
        const titleMatch = text.match(/<title>(.*?)<\/title>/i);
        
        const title = ogTitleMatch ? ogTitleMatch[1] : (titleMatch ? titleMatch[1] : "View Project");
        
        res.status(200).json({ title: title.trim() });
    } catch (e) {
        res.status(200).json({ title: "View Project" });
    }
}