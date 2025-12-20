-- Migration: Create bidder_cache table for performance optimization
-- This table caches bidder names and FIDs to reduce repeated contract/Neynar calls

CREATE TABLE IF NOT EXISTS bidder_cache (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    bidder_name VARCHAR(255),
    bidder_fid INTEGER,
    last_updated TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for fast lookups by wallet
CREATE INDEX IF NOT EXISTS idx_bidder_cache_wallet ON bidder_cache(wallet_address);

-- Create index for TTL-like management (for cleanup of stale entries)
CREATE INDEX IF NOT EXISTS idx_bidder_cache_updated ON bidder_cache(last_updated);
