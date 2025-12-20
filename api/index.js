import { Pool } from '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import crypto from 'crypto';

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
        // Sync user
        async function handleSyncUser(req, res) {
            if (req.method !== 'POST') return res.status(405).end();
    
            try {
                if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL not configured' });
        
                const pool = new Pool({ connectionString: process.env.DATABASE_URL });
                let { fid, wallet, username, pfp, score } = req.body;

                if (!fid) return res.status(400).json({ error: 'fid is required' });

                // If wallet not provided, fetch from Neynar bulk endpoint using fid
                if (!wallet) {
                    try {
                        const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(fid)}`;
                        const resp = await fetch(neynarUrl, { method: 'GET', headers: { 'x-api-key': process.env.NEYNAR_API_KEY || '' } });
                        const nd = await resp.json();
                        // Response may have .users array or be an object keyed by fid
                        let userObj = null;
                        if (Array.isArray(nd?.users) && nd.users.length > 0) userObj = nd.users[0];
                        else if (nd && typeof nd === 'object') {
                            const key = Object.keys(nd).find(k => String(k) === String(fid));
                            if (key) userObj = nd[key]?.[0] || nd[key];
                        }

                        if (!userObj) userObj = nd?.[0] || null;

                        if (userObj) {
                            if (userObj?.verified_addresses?.primary?.eth_address) {
                                wallet = userObj.verified_addresses.primary.eth_address;
                            } else if (userObj?.verified_addresses?.eth_addresses?.[0]) {
                                wallet = userObj.verified_addresses.eth_addresses[0];
                            }
                            if (userObj?.username) username = username || userObj.username;
                            if (userObj?.pfpUrl) pfp = pfp || userObj.pfpUrl;
                            // Capture Neynar score if present
                            if (userObj?.neynar_user_score != null) score = Number(userObj.neynar_user_score);
                            else if (userObj?.neynar_score != null) score = Number(userObj.neynar_score);
                        }
                    } catch (e) {
                        console.debug('sync-user: Neynar fetch failed', e?.message || e);
                    }
                }

                await pool.query(`
                    INSERT INTO users (fid, wallet_address, username, pfp_url, neynar_score, last_score_update)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (fid) DO UPDATE SET
                        wallet_address = COALESCE(EXCLUDED.wallet_address, users.wallet_address),
                        username = EXCLUDED.username,
                        pfp_url = EXCLUDED.pfp_url,
                        neynar_score = EXCLUDED.neynar_score,
                        last_score_update = NOW(),
                        updated_at = NOW()
                `, [fid, wallet ? wallet.toLowerCase() : null, username, pfp, score]);

                res.status(200).json({ success: true, wallet: wallet || null });
            } catch (e) {
                console.error('sync-user error:', e.message);
                res.status(500).json({ error: e.message });
            }
        }
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

// Lookup owner by wallet address
async function handleLookupOwner(req, res) {
    const { address } = req.query;
    if (!address) return res.status(400).json({ fid: null, username: null });

    try {
        const sql = neon(process.env.DATABASE_URL);
        const addr = String(address).toLowerCase();

        // Check bidder_cache first
        const cache = await sql`SELECT bidder_name, bidder_fid FROM bidder_cache WHERE wallet_address = ${addr} LIMIT 1`;
        if (cache?.length && (cache[0].bidder_fid || cache[0].bidder_name)) {
            return res.status(200).json({ fid: cache[0].bidder_fid || null, username: cache[0].bidder_name || null });
        }

        // Check users table
        const owner = await sql`SELECT fid, username FROM users WHERE wallet_address = ${addr} LIMIT 1`;
        if (owner?.length) {
            // Optionally cache the result
            try {
                await sql`
                    INSERT INTO bidder_cache (wallet_address, bidder_name, bidder_fid, last_updated)
                    VALUES (${addr}, ${owner[0].username || null}, ${owner[0].fid || null}, NOW())
                    ON CONFLICT (wallet_address) DO UPDATE SET
                        bidder_name = COALESCE(EXCLUDED.bidder_name, bidder_cache.bidder_name),
                        bidder_fid = COALESCE(EXCLUDED.bidder_fid, bidder_cache.bidder_fid),
                        last_updated = NOW()
                `;
            } catch (e) { /* ignore caching errors */ }

            return res.status(200).json({ fid: owner[0].fid || null, username: owner[0].username || null });
        }

        // Try Neynar lookup as a fallback
        try {
            const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${encodeURIComponent(addr)}`;
            const response = await fetch(url, { method: 'GET', headers: { 'x-api-key': process.env.NEYNAR_API_KEY } });
            const data = await response.json();
            const key = Object.keys(data).find(k => k.toLowerCase() === addr);
            const userObj = key ? data[key]?.[0] : null;
            const username = userObj?.username || null;
            const fid = userObj?.fid || userObj?.farcasterId || userObj?.id || null;

            if (fid) {
                const pool = new Pool({ connectionString: process.env.DATABASE_URL });
                try {
                    await pool.query(`
                        INSERT INTO users (fid, wallet_address, username, last_score_update)
                        VALUES ($1,$2,$3,NOW())
                        ON CONFLICT (fid) DO UPDATE SET
                            wallet_address = COALESCE(EXCLUDED.wallet_address, users.wallet_address),
                            username = EXCLUDED.username,
                            updated_at = NOW()
                    `, [fid, addr, username]);
                } catch (e) { /* ignore */ }
            }

            return res.status(200).json({ fid: fid || null, username: username || null });
        } catch (e) {
            console.debug('lookup-owner neynar failed', e);
            return res.status(200).json({ fid: null, username: null });
        }
    } catch (e) {
        console.error('lookup-owner error', e?.message || e);
        return res.status(500).json({ error: e.message });
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
                // Return 200 with null values instead of 404 to avoid frontend errors
                return res.status(200).json({ bidder_name: null, bidder_fid: null, last_updated: null });
            }
        } catch (e) {
            console.error('cache-bidder-data error:', e.message);
            return res.status(200).json({ bidder_name: null, bidder_fid: null, last_updated: null });
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
    
    try {
        if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL not configured' });
        
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        let { fid, wallet, username, pfp, score } = req.body;

        if (!fid) return res.status(400).json({ error: 'fid is required' });

        // If wallet not provided, fetch from Neynar using the fid (primary address)
        if (!wallet) {
            try {
                const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(String(fid))}`;
                const resp = await fetch(neynarUrl, { method: 'GET', headers: { 'x-api-key': process.env.NEYNAR_API_KEY } });
                const nd = await resp.json();

                // Try multiple shapes: { users: [...] } or array or object keyed by fid
                let userObj = null;
                if (Array.isArray(nd?.users) && nd.users.length > 0) userObj = nd.users[0];
                else if (Array.isArray(nd) && nd.length > 0) userObj = nd[0];
                else if (nd[String(fid)]) userObj = nd[String(fid)];
                else if (nd.users && nd.users[String(fid)]) userObj = nd.users[String(fid)];

                if (userObj) {
                    if (userObj?.verified_addresses?.primary?.eth_address) wallet = userObj.verified_addresses.primary.eth_address;
                    else if (userObj?.verified_addresses?.eth_addresses?.[0]) wallet = userObj.verified_addresses.eth_addresses[0];
                    if (wallet) wallet = String(wallet).toLowerCase();
                    if (userObj?.neynar_user_score != null) score = Number(userObj.neynar_user_score);
                    else if (userObj?.neynar_score != null) score = Number(userObj.neynar_score);
                }
            } catch (e) {
                console.debug('sync-user: failed to fetch wallet from Neynar', e?.message || e);
            }
        }

        await pool.query(`
            INSERT INTO users (fid, wallet_address, username, pfp_url, neynar_score, last_score_update)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (fid) DO UPDATE SET
                wallet_address = COALESCE(EXCLUDED.wallet_address, users.wallet_address),
                username = EXCLUDED.username,
                pfp_url = EXCLUDED.pfp_url,
                neynar_score = EXCLUDED.neynar_score,
                last_score_update = NOW(),
                updated_at = NOW()
        `, [fid, wallet || null, username, pfp, score]);

        res.status(200).json({ success: true, wallet: wallet || null });
    } catch (e) {
        console.error('sync-user error:', e.message);
        res.status(500).json({ error: e.message });
    }
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
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    let { url, content, wallet, fid } = req.body;

    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL not configured' });

    try {
        const sql = neon(process.env.DATABASE_URL);
        let w = wallet ? wallet.toLowerCase() : null;

        // If no wallet but an fid is provided, try to resolve wallet from users table
        if (!w && fid) {
            const owner = await sql`SELECT wallet_address FROM users WHERE fid = ${fid} LIMIT 1`;
            if (owner?.length && owner[0].wallet_address) {
                w = owner[0].wallet_address.toLowerCase();
            } else {
                // Try to find the bidder wallet by scanning on-chain bids for this URL
                try {
                    const publicClient = createPublicClient({ chain: base, transport: http(process.env.RPC_URL || 'https://mainnet.base.org') });
                    const abi = [
                        "function getAllBids() view returns (tuple(uint256 totalAmount, string urlString, tuple(address contributor, uint256 amount, uint256 timestamp)[] contributions)[])"
                    ];
                    const rawBids = await publicClient.readContract({ address: '0x6A0FB6dfDA897dAe3c69D06d5D6B5d6b251281da', abi, functionName: 'getAllBids' });
                    const found = (rawBids || []).find(b => ( (b.urlString ?? b[1] ?? '') || '').toLowerCase() === (url || '').toLowerCase());
                    if (found) {
                        let candidate = '';
                        if (Array.isArray(found.contributions) && found.contributions.length > 0) {
                            const c0 = found.contributions[0];
                            candidate = (c0?.contributor ?? c0?.[0] ?? '') || '';
                        } else if (found[2]) {
                            if (typeof found[2] === 'string') candidate = found[2];
                            else if (Array.isArray(found[2]) && found[2][0]) candidate = (found[2][0]?.contributor ?? found[2][0]?.[0] ?? '') || '';
                        }
                        candidate = (candidate || '').toLowerCase();
                        if (candidate) {
                            // Try Neynar to map address -> fid
                            try {
                                const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${encodeURIComponent(candidate)}`;
                                const resp = await fetch(neynarUrl, { method: 'GET', headers: { 'x-api-key': process.env.NEYNAR_API_KEY } });
                                const nd = await resp.json();
                                const key = Object.keys(nd).find(k => k.toLowerCase() === candidate);
                                const userObj = key ? nd[key]?.[0] : null;
                                const neynarFid = userObj?.fid || userObj?.farcasterId || userObj?.id || null;
                                if (neynarFid && String(neynarFid) === String(fid)) {
                                    w = candidate;
                                }
                            } catch (e) { console.debug('neynar reverse lookup failed', e); }
                        }
                    }
                } catch (e) { console.debug('on-chain lookup for bidder wallet failed', e); }

                if (!w) {
                    return res.status(400).json({ error: 'No wallet on file for provided fid' });
                }
            }
        }

        if (!w) return res.status(400).json({ error: 'wallet or fid required' });

        // Compute sha256 hash of the URL as hex (do this in JS to avoid depending on pgcrypto)
        const urlHash = crypto.createHash('sha256').update(String(url)).digest('hex');

        // Attempt to insert or update only if the caller is the owner (bidder_wallet)
        const result = await sql`
            INSERT INTO project_facts (url_hash, urlString, bidder_wallet, content, updated_at)
            VALUES (${urlHash}, ${url}, ${w}, ${content}, NOW())
            ON CONFLICT (url_hash) 
            DO UPDATE SET content = ${content}, updated_at = NOW()
            WHERE project_facts.bidder_wallet = ${w}
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
