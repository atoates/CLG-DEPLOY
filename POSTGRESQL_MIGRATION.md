# PostgreSQL Migration Guide

## Overview
Converting Crypto Lifeguard from SQLite (better-sqlite3) to PostgreSQL (pg)

## Status: IN PROGRESS

### Completed
- ✅ Updated package.json (better-sqlite3 → pg)
- ✅ Changed imports in server.js
- ✅ Updated constants (DB_PATH → DATABASE_URL)
- ✅ Created Pool connection with SSL config
- ✅ Created async initDB() function for table initialization

### In Progress
- 🔄 Converting all database queries from sync to async
- 🔄 Replacing prepared statements with parameterized queries

### Pending
- ❌ Convert migrate.js
- ❌ Convert all .sql migration files (SQLite → PostgreSQL syntax)
- ❌ Convert restore-alerts.js
- ❌ Convert backup.js
- ❌ Convert update-tags.js
- ❌ Test locally
- ❌ Deploy to Railway

## Key Differences: SQLite vs PostgreSQL

### 1. Auto-increment IDs
```sql
-- SQLite
INTEGER PRIMARY KEY AUTOINCREMENT

-- PostgreSQL
SERIAL PRIMARY KEY
```

### 2. Date/Time Functions
```sql
-- SQLite
strftime('%s','now')

-- PostgreSQL  
EXTRACT(EPOCH FROM NOW())
```

### 3. INSERT OR IGNORE
```sql
-- SQLite
INSERT OR IGNORE INTO users (id) VALUES (?)

-- PostgreSQL
INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING
```

### 4. INSERT OR REPLACE
```sql
-- SQLite
INSERT OR REPLACE INTO alerts (...) VALUES (...)

-- PostgreSQL
INSERT INTO alerts (...) VALUES (...) ON CONFLICT (id) DO UPDATE SET ...
```

### 5. UPSERT Pattern
```sql
-- SQLite
INSERT INTO user_prefs (...) VALUES (...)
ON CONFLICT(user_id) DO UPDATE SET ...

-- PostgreSQL (same, but need explicit conflict column)
INSERT INTO user_prefs (...) VALUES (...)
ON CONFLICT(user_id) DO UPDATE SET ...
```

### 6. Parameter Placeholders
```sql
-- SQLite (named parameters with @)
INSERT INTO audit_log (user_id, email) VALUES (@user_id, @email)

-- PostgreSQL (positional $ parameters)
INSERT INTO audit_log (user_id, email) VALUES ($1, $2)
```

### 7. PRAGMA Commands
```sql
-- SQLite
PRAGMA table_info(users)
PRAGMA journal_mode = WAL

-- PostgreSQL
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'
-- No WAL pragma needed (always enabled)
```

### 8. VACUUM
```sql
-- SQLite
VACUUM INTO '/path/to/backup.sqlite'

-- PostgreSQL
-- Use pg_dump or custom backup solution
```

## API Changes: better-sqlite3 vs pg

### Synchronous → Asynchronous

**SQLite (better-sqlite3):**
```javascript
const db = new Database(DB_PATH);
const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
const rows = db.prepare('SELECT * FROM alerts').all();
db.prepare('INSERT INTO users (id) VALUES (?)').run(userId);
db.exec('CREATE TABLE ...');
```

**PostgreSQL (pg):**
```javascript
const pool = new Pool({ connectionString: DATABASE_URL });
const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
const row = rows[0];
const { rows: allAlerts } = await pool.query('SELECT * FROM alerts');
await pool.query('INSERT INTO users (id) VALUES ($1)', [userId]);
await pool.query('CREATE TABLE ...');
```

### Named Parameters → Positional

**SQLite:**
```javascript
const stmt = db.prepare('INSERT INTO audit_log (user_id, email, event) VALUES (@user_id, @email, @event)');
stmt.run({ user_id: 'u123', email: 'test@example.com', event: 'login' });
```

**PostgreSQL:**
```javascript
await pool.query(
  'INSERT INTO audit_log (user_id, email, event) VALUES ($1, $2, $3)',
  ['u123', 'test@example.com', 'login']
);
```

## Migration Strategy for server.js

### Helper Functions Needed

```javascript
// Upsert user (INSERT ON CONFLICT DO NOTHING)
async function upsertUser(userId) {
  await pool.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
}

// Get user
async function getUser(userId) {
  const { rows } = await pool.query(
    'SELECT id, google_id, email, name, avatar, username FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || null;
}

// Get user by username
async function getUserByUsername(username) {
  const { rows } = await pool.query(
    'SELECT id FROM users WHERE lower(username) = lower($1)',
    [username]
  );
  return rows[0] || null;
}

// Set username
async function setUsername(username, userId) {
  await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, userId]);
}

// Set avatar
async function setAvatar(avatar, userId) {
  await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, userId]);
}

// Get user preferences
async function getPrefs(userId) {
  const { rows } = await pool.query('SELECT * FROM user_prefs WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

// Upsert preferences
async function upsertPrefs(userId, watchlist, severity, showAll, dismissed) {
  await pool.query(`
    INSERT INTO user_prefs (user_id, watchlist_json, severity_json, show_all, dismissed_json, updated_at)
    VALUES ($1, $2, $3, $4, $5, EXTRACT(EPOCH FROM NOW()))
    ON CONFLICT(user_id) DO UPDATE SET
      watchlist_json = excluded.watchlist_json,
      severity_json = excluded.severity_json,
      show_all = excluded.show_all,
      dismissed_json = excluded.dismissed_json,
      updated_at = excluded.updated_at
  `, [userId, watchlist, severity, showAll, dismissed]);
}

// Insert audit log
async function insertAudit(userId, email, event, detail) {
  await pool.query(
    'INSERT INTO audit_log (user_id, email, event, detail) VALUES ($1, $2, $3, $4)',
    [userId, email, event, detail]
  );
}

// Insert/update alert
async function upsertAlert(alertData) {
  await pool.query(`
    INSERT INTO alerts (id, token, title, description, severity, deadline, tags, further_info, source_type, source_url)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      token = excluded.token,
      title = excluded.title,
      description = excluded.description,
      severity = excluded.severity,
      deadline = excluded.deadline,
      tags = excluded.tags,
      further_info = excluded.further_info,
      source_type = excluded.source_type,
      source_url = excluded.source_url
  `, [
    alertData.id,
    alertData.token,
    alertData.title,
    alertData.description,
    alertData.severity,
    alertData.deadline,
    alertData.tags,
    alertData.further_info,
    alertData.source_type,
    alertData.source_url
  ]);
}
```

### Endpoints to Convert (Need async/await)

1. ✅ `initDB()` - Already converted
2. ❌ Middleware: User creation (line 230) - `qUpsertUser.run(uid)`
3. ❌ `reloadAlertsFromDatabase()` (line 272, 294) - Uses `db.prepare().all()`
4. ❌ `/admin/info` (line 318-323) - COUNT queries
5. ❌ `/api/me` GET (line 340-374) - User and prefs queries
6. ❌ `/api/me` PUT username (line 387-401) - Username update
7. ❌ `/api/me` PUT avatar (line 407-419) - Avatar update
8. ❌ `/api/me` PUT prefs (line 420-433) - Prefs update
9. ❌ `/api/alerts` POST (line 475) - Insert alert
10. ❌ `/api/alerts/:id` PUT (line 556) - Update alert
11. ❌ `/api/alerts/:id` DELETE (line 589) - Delete alert
12. ❌ `/api/ai/generate-alert` (line 667) - Insert generated alert
13. ❌ `/api/token-requests` POST (line 774-820) - Token request submission
14. ❌ `/api/token-requests/mine` (line 832-848) - User's requests
15. ❌ `/api/admin/token-requests` (line 852-864) - All requests
16. ❌ `/ready` healthcheck (line 1447-1454) - `SELECT 1` query
17. ❌ `/debug/sql` (line 1508-1524) - SQL execution
18. ❌ `/admin/migrate` (line 1525-1582) - Migration helpers
19. ❌ `/admin/backup` (line 1589-1610) - Backup creation
20. ❌ `/admin/users` (line 1645-1695) - User listing
21. ❌ `/admin/export/users.csv` (line 1699-1722) - User CSV export
22. ❌ `/admin/export/audit.csv` (line 1727-1747) - Audit CSV export
23. ❌ `/auth/google/callback` (line 1838-1954) - OAuth user upsert

### Critical: All Endpoints Need to Become async

Every endpoint using database queries must be converted to `async` and use `await`:

```javascript
// Before (sync)
app.get('/api/me', (req, res) => {
  const row = qGetPrefs.get(uid);
  res.json(row);
});

// After (async)
app.get('/api/me', async (req, res) => {
  const row = await getPrefs(uid);
  res.json(row);
});
```

## Files to Convert

### server.js
- Replace all `qUpsertUser`, `qGetUser`, etc. with async helper functions
- Convert all endpoints to `async` functions
- Replace all `.run()`, `.get()`, `.all()` with `await pool.query()`
- Convert named parameters (@param) to positional ($1, $2, etc.)

### migrate.js
- Replace `Database` with `Pool`
- Convert `db.prepare().get()` to `pool.query()`
- Make migration runner async
- Convert `db.exec()` to `pool.query()`

### migrations/*.sql Files
- 001_create_alerts_table.sql: INTEGER AUTOINCREMENT → SERIAL
- 002_add_tags_to_alerts.sql: Review for compatibility
- 003_create_users_and_prefs.sql: Convert strftime → EXTRACT(EPOCH FROM NOW())
- 004_add_username_to_users.sql: Review for compatibility

### restore-alerts.js
- Replace `Database` with `Pool`
- Convert to async
- Replace INSERT OR REPLACE with ON CONFLICT DO UPDATE

### backup.js
- Replace VACUUM INTO with pg_dump or custom logic
- Make async

### update-tags.js
- Replace `Database` with `Pool`
- Convert to async
- Replace queries with pool.query()

## Testing Plan

1. Install PostgreSQL locally: `brew install postgresql@15`
2. Start PostgreSQL: `brew services start postgresql@15`
3. Create test database: `createdb clg_test`
4. Set DATABASE_URL: `export DATABASE_URL=postgresql://localhost/clg_test`
5. Run migrations: `npm run migrate`
6. Test restore: `npm run restore-alerts`
7. Start server: `npm start`
8. Test all endpoints
9. Deploy to Railway

## Deployment Checklist

- [ ] Ensure DATABASE_URL is set in Railway environment
- [ ] Push code to GitHub
- [ ] Railway auto-deploys
- [ ] Migrations run automatically (from Procfile)
- [ ] Alerts restored from JSON backup
- [ ] Test production endpoints
- [ ] Monitor logs for errors

## Notes

- PostgreSQL is always in WAL mode (no pragma needed)
- SSL required for Railway PostgreSQL (configured in Pool setup)
- Users will need to re-register (existing data is ephemeral anyway)
- Alerts will be restored from alerts.json backup
- No data migration needed from old SQLite (it was temporary)
