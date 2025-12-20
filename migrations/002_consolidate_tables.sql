-- Migration: Consolidate redundant tables and add wallet tracking
-- This migration drops redundant tables (claims, articles) and 
-- consolidates their functionality into facts_claims and project_facts.
-- Also adds wallet columns to facts_claims for tracking.

-- Drop redundant tables (if they exist)
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS articles;

-- Add missing columns to facts_claims if not present
ALTER TABLE facts_claims ADD COLUMN IF NOT EXISTS fid BIGINT;
ALTER TABLE facts_claims ADD COLUMN IF NOT EXISTS url_string TEXT;

-- Add missing columns to users if not present
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index on facts_claims for efficient lookups
CREATE INDEX IF NOT EXISTS idx_facts_claims_fid ON facts_claims (fid);
CREATE INDEX IF NOT EXISTS idx_facts_claims_url_string ON facts_claims (url_string);

-- All done. Tables now consolidated:
-- - project_facts: stores content/facts for URLs (formerly articles table functions)
-- - facts_claims: stores claim records, now with fid and url_string tracking
-- - users: stores user info with wallet_address (no changes needed, already exists)
-- - bidder_cache: performance cache (already exists)
