-- ROLLBACK for migrations 005 and 006
-- Run this ONLY on staging if needed
-- ⚠️ This will delete news_cache and user_summaries tables

-- Drop news cache table (from migration 006)
DROP TABLE IF EXISTS news_cache;

-- Drop user summaries table (from migration 005)
DROP TABLE IF EXISTS user_summaries;

-- To execute on Railway staging:
-- 1. Go to Railway dashboard
-- 2. Open the database service
-- 3. Click "Data" tab
-- 4. Click "Query" 
-- 5. Paste and run this SQL
