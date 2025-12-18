export default async function handler(req, res) {
    const { url } = req.query;
    if (!url) return res.status(400).json({ title: "No URL" });

    // 1. Handle Farcaster Mini-App Links (Warpcast wrappers)
    if (url.includes('warpcast.com/~/apps/')) {
        try {
            const parts = url.split('/');
            let name = parts[parts.length - 1].split('?')[0]; // Remove query params
            name = name.replace(/-/g, ' '); // 'solar-flare' -> 'solar flare'
            return res.status(200).json({ 
                title: name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') 
            });
        } catch (e) { return res.status(200).json({ title: "Farcaster App" }); }
    }

    try {
        const response = await fetch(url, {
            headers: {
                // Mimicking Googlebot is the best way to bypass Vercel/Cloudflare checkpoints
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
            }
        });
        const text = await response.text();
        
        // Try OG Title first, then standard Title
        const ogTitle = text.match(/<meta property="og:title" content="(.*?)"/i);
        const standardTitle = text.match(/<title>(.*?)<\/title>/i);
        
        let title = ogTitle ? ogTitle[1] : (standardTitle ? standardTitle[1] : "");

        // If we got a security checkpoint or empty title, derive from domain
        if (!title || title.includes("Check") || title.includes("Cloudflare") || title.includes("Vercel")) {
            const domain = new URL(url).hostname.replace('www.', '').split('.')[0];
            title = domain.charAt(0).toUpperCase() + domain.slice(1);
        }
        
        res.status(200).json({ title: title.trim() });
    } catch (e) {
        const domain = new URL(url).hostname.replace('www.', '').split('.')[0];
        res.status(200).json({ title: domain.charAt(0).toUpperCase() + domain.slice(1) });
    }
}