export default async function handler(req, res) {
    const { url } = req.query;
    if (!url) return res.status(400).json({ title: "No URL" });

    try {
        const response = await fetch(url);
        const text = await response.text();
        
        // Match <title> or <meta property="og:title">
        const titleMatch = text.match(/<title>(.*?)<\/title>/i);
        const ogTitleMatch = text.match(/<meta property="og:title" content="(.*?)"/i);
        
        const title = ogTitleMatch ? ogTitleMatch[1] : (titleMatch ? titleMatch[1] : "Unknown Project");
        
        res.setHeader('Cache-Control', 's-maxage=3600'); // Cache for 1 hour
        res.status(200).json({ title: title.trim() });
    } catch (e) {
        res.status(200).json({ title: "View Project" });
    }
}