-- ============================================================================
-- QR FACTS: Complete Schema Migration (Clean Reset)
-- ============================================================================
-- This script drops ALL existing tables and recreates the correct unified schema.
-- BACKUP YOUR DATABASE BEFORE RUNNING THIS.
-- 
-- Usage: psql "$DATABASE_URL" -f this_file.sql

-- Drop existing tables in dependency order
DROP TABLE IF EXISTS facts_claims CASCADE;
DROP TABLE IF EXISTS project_facts CASCADE;
DROP TABLE IF EXISTS bidder_cache CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- 1. USERS TABLE
-- ============================================================================
-- Stores user profile info synced from Farcaster/Neynar
CREATE TABLE users (
  fid BIGINT PRIMARY KEY,
  wallet_address VARCHAR(42),                           -- Primary Ethereum wallet (from Neynar verified_addresses.primary.eth_address)
  username VARCHAR(255),
  pfp_url TEXT,
  neynar_score NUMERIC,
  last_score_update TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_wallet ON users (lower(wallet_address)) WHERE wallet_address IS NOT NULL;
CREATE INDEX idx_users_username ON users (username);

-- ============================================================================
-- 2. PROJECT FACTS TABLE
-- ============================================================================
-- Stores facts/content submitted by bidders for each URL
-- Consolidated from old 'articles' and 'project_facts' tables
CREATE TABLE project_facts (
  url_hash TEXT PRIMARY KEY,                             -- SHA256 hash of URL (used for ON CONFLICT)
  urlString TEXT NOT NULL,                              -- Full URL string (primary lookup key)
  bidder_wallet VARCHAR(42),                             -- Wallet of original bidder
  content TEXT DEFAULT 'not provided',                   -- Fact/article content
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_project_facts_url ON project_facts (lower(urlString));
CREATE INDEX idx_project_facts_wallet ON project_facts (lower(bidder_wallet)) WHERE bidder_wallet IS NOT NULL;

-- ============================================================================
-- 3. FACTS CLAIMS TABLE
-- ============================================================================
-- Tracks when users claim $FACTS tokens (daily limit enforcement + audit log)
-- Consolidated from old 'claims' and 'facts_claims' tables
CREATE TABLE facts_claims (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,                   -- User's wallet (lowercase)
  fid BIGINT,                                            -- User's Farcaster ID
  url_string TEXT,                                       -- URL they claimed for (for lookup.js compatibility)
  amount NUMERIC NOT NULL,                               -- Amount of $FACTS claimed
  claim_date DATE DEFAULT CURRENT_DATE,                  -- For daily limit enforcement
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_facts_claims_wallet_date ON facts_claims (lower(wallet_address), claim_date);
CREATE INDEX idx_facts_claims_fid ON facts_claims (fid);
CREATE INDEX idx_facts_claims_url ON facts_claims (url_string);

-- ============================================================================
-- 4. BIDDER CACHE TABLE
-- ============================================================================
-- Performance cache for bidder names and FIDs (populated by resolveMetadata)
CREATE TABLE bidder_cache (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  bidder_name VARCHAR(255),
  bidder_fid BIGINT,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bidder_cache_wallet ON bidder_cache (lower(wallet_address));
CREATE INDEX idx_bidder_cache_fid ON bidder_cache (bidder_fid);
CREATE INDEX idx_bidder_cache_updated ON bidder_cache (last_updated);

-- ============================================================================
-- Schema Complete
-- ============================================================================
-- Summary of tables:
-- - users: sync-user inserts/updates. Fields: fid, wallet_address, username, pfp_url, neynar_score
-- - project_facts: save-facts inserts; get-facts reads. Unified table for content storage.
-- - facts_claims: claims.js inserts claim records; check-claims.js queries for claimed URLs
-- - bidder_cache: resolveMetadata populates for performance
--
-- All table and column names now match the code references across api/*.js
