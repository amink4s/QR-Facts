import { Pool } from '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    const { action } = req.query;

    // Route requests based on action parameter
    switch (action) {
        case 'lookup-owner':
            return handleLookupOwner(req, res);
        case 'lookup-names':
            return handleLookupNames(req, res);
        case 'cache-bidder-data':
            return handleCacheBidderData(req, res);
        case 'get-title':
            return handleGetTitle(req, res);
        case 'get-facts':
            return handleGetFacts(req, res);
        case 'sync-user':
            return handleSyncUser(req, res);
        case 'user':
            return handleUser(req, res);
        case 'facts':
            return handleFacts(req, res);
        case 'claims':
            return handleClaims(req, res);
        case 'check-claims':
            return handleCheckClaims(req, res);
        case 'submit-fact':
            return handleSubmitFact(req, res);
        case 'save-facts':
            return handleSaveFacts(req, res);
        default:
            return res.status(404).json({ error: 'Invalid action' });
    }
}

// Lookup owner by wallet address
async function handleLookupOwner(req, res) {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address required' });
    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL not configured' });

    try {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        const r = await pool.query(`SELECT fid, username, pfp_url FROM users WHERE wallet_address = $1 LIMIT 1`, [address.toLowerCase()]);
        if (r.rowCount === 0) return res.status(200).json({ fid: null, username: null, pfp: null });
        const row = r.rows[0];
        res.status(200).json({ fid: row.fid, username: row.username, pfp: row.pfp_url });
    } catch (e) {
        console.error('lookup-owner error', e);
        res.status(500).json({ error: e.message });
    }
}

// Lookup names from Neynar
async function handleLookupNames(req, res) {
    const { address } = req.query;
    if (!address) return res.status(400).json({ username: null });

    try {
        // Use documented Neynar endpoint and header
        const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${encodeURIComponent(address)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
        });
        const data = await response.json();

        // Neynar returns an object keyed by address (lowercased); make parsing robust
        const key = Object.keys(data).find(k => k.toLowerCase() === address.toLowerCase());
        const userObj = key ? data[key]?.[0] : null;
        const username = userObj?.username || null;
        // Neynar may return fid or id field; try a few likely keys
        const fid = userObj?.fid || userObj?.farcasterId || userObj?.id || null;
        return res.status(200).json({ username, fid });
    } catch (e) {
        console.error('lookup-names error', e?.message || e);
        return res.status(200).json({ username: null });
    }
}

// Cache bidder data
async function handleCacheBidderData(req, res) {
    if (req.method === 'POST') {
        const { bidderWallet, bidderName, bidderFid } = req.body;
        if (!bidderWallet) {
            return res.status(400).json({ error: 'bidderWallet is required' });
        }

        try {
            const sql = neon(process.env.DATABASE_URL);
            const lowerWallet = bidderWallet.toLowerCase();

            await sql`
                INSERT INTO bidder_cache (wallet_address, bidder_name, bidder_fid, last_updated)
                VALUES (${lowerWallet}, ${bidderName || null}, ${bidderFid || null}, NOW())
                ON CONFLICT (wallet_address) DO UPDATE SET
                    bidder_name = ${bidderName || null},
                    bidder_fid = ${bidderFid || null},
                    last_updated = NOW()
            `;

            return res.status(200).json({ success: true });
        } catch (e) {
            console.error('cache-bidder-data error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    } else if (req.method === 'GET') {
        const { wallet } = req.query;
        if (!wallet) {
            return res.status(400).json({ error: 'wallet query param is required' });
        }

        try {
            const sql = neon(process.env.DATABASE_URL);
            const result = await sql`
                SELECT bidder_name, bidder_fid, last_updated FROM bidder_cache
                WHERE wallet_address = ${wallet.toLowerCase()}
                LIMIT 1
            `;

            if (result.length > 0) {
                return res.status(200).json(result[0]);
            } else {
                return res.status(404).json({ error: 'Not found' });
            }
        } catch (e) {
            console.error('cache-bidder-data error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}

// Get title from URL
async function handleGetTitle(req, res) {
    const { url } = req.query;
    if (!url) return res.status(400).json({ title: "No URL" });

    if (url.includes('warpcast.com/~/apps/')) {
        try {
            const parts = url.split('/');
            let name = parts[parts.length - 1].split('?')[0];
            name = name.replace(/-/g, ' ');
            return res.status(200).json({ 
                title: name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') 
            });
        } catch (e) { return res.status(200).json({ title: "Farcaster App" }); }
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
            }
        });
        const text = await response.text();
        const ogTitle = text.match(/<meta property="og:title" content="(.*?)"/i);
        const standardTitle = text.match(/<title>(.*?)<\/title>/i);
        let title = ogTitle ? ogTitle[1] : (standardTitle ? standardTitle[1] : "");
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

// Get facts
async function handleGetFacts(req, res) {
    const { url } = req.query;
    if (!url) return res.status(400).json({ content: "" });

    try {
        const sql = neon(process.env.DATABASE_URL);
        const result = await sql`SELECT content, bidder_wallet FROM project_facts WHERE urlString = ${url} LIMIT 1`;
        
        if (result.length > 0) {
            const row = result[0];
            let ownerFid = null, ownerUsername = null;
            if (row.bidder_wallet) {
                const owner = await sql`SELECT fid, username FROM users WHERE wallet_address = ${row.bidder_wallet.toLowerCase()} LIMIT 1`;
                if (owner?.length) { ownerFid = owner[0].fid; ownerUsername = owner[0].username; }
            }

            return res.status(200).json({ content: row.content, bidder_wallet: row.bidder_wallet || null, ownerFid, ownerUsername });
        } else {
            return res.status(200).json({ content: "The bidder has not provided any specific facts for this project yet.", bidder_wallet: null, ownerFid: null, ownerUsername: null });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

// Sync user
async function handleSyncUser(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { fid, wallet, username, pfp, score } = req.body;

    await pool.query(`
        INSERT INTO users (fid, wallet_address, username, pfp_url, neynar_score, last_score_update)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (fid) DO UPDATE SET
            wallet_address = EXCLUDED.wallet_address,
            username = EXCLUDED.username,
            pfp_url = EXCLUDED.pfp_url,
            neynar_score = EXCLUDED.neynar_score,
            last_score_update = NOW(),
            updated_at = NOW()
    `, [fid, wallet, username, pfp, score]);

    res.status(200).json({ success: true });
}

// User handler (placeholder for compatibility)
async function handleUser(req, res) {
    res.status(405).json({ error: 'Use lookup-owner action' });
}

// Facts handler (placeholder for compatibility)
async function handleFacts(req, res) {
    res.status(405).json({ error: 'Use get-facts action' });
}

// Claims handler (placeholder for compatibility)
async function handleClaims(req, res) {
    res.status(405).json({ error: 'Claims not implemented in consolidated handler' });
}

// Check claims handler (placeholder for compatibility)
async function handleCheckClaims(req, res) {
    res.status(405).json({ error: 'Check claims not implemented in consolidated handler' });
}

// Submit fact handler (placeholder for compatibility)
async function handleSubmitFact(req, res) {
    res.status(405).json({ error: 'Submit fact not implemented in consolidated handler' });
}

// Save facts handler (placeholder for compatibility)
async function handleSaveFacts(req, res) {
    res.status(405).json({ error: 'Save facts not implemented in consolidated handler' });
}

export const config = { api: { bodyParser: true } };
