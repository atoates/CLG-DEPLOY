# CLG-DEPLOY Production App Audit

## Purpose
Audit the CLG-DEPLOY backend to understand all write operations before implementing read-only architecture.

---

## Audit Checklist

### 1. Repository Access
- [ ] Clone/access CLG-DEPLOY repository
- [ ] Identify main server file (likely `server.js` or `index.js`)
- [ ] Review project structure

### 2. Endpoint Discovery

#### Write Endpoints to Find:
```bash
# Search for all POST endpoints
grep -r "app.post\|router.post" .

# Search for all PUT endpoints  
grep -r "app.put\|router.put" .

# Search for all DELETE endpoints
grep -r "app.delete\|router.delete" .

# Search for all PATCH endpoints
grep -r "app.patch\|router.patch" .
```

#### Document Each Endpoint:
- [ ] Endpoint path
- [ ] HTTP method
- [ ] Purpose
- [ ] Who uses it (admin vs user)
- [ ] Database tables modified
- [ ] Critical or safe to remove

### 3. Database Write Operations

#### Tables to Check:
- [ ] `alerts` table writes
- [ ] `news_cache` table writes
- [ ] `user_preferences` table writes (if exists)
- [ ] Any other tables?

#### Direct SQL Queries:
```bash
# Search for INSERT statements
grep -r "INSERT INTO" .

# Search for UPDATE statements
grep -r "UPDATE " .

# Search for DELETE statements
grep -r "DELETE FROM" .
```

### 4. Cron Jobs & Scheduled Tasks

#### Files to Check:
- [ ] `cron.js` or `scheduler.js`
- [ ] `package.json` scripts
- [ ] Railway configuration files
- [ ] Any `setInterval` or `setTimeout` in code

#### Look For:
```bash
# Search for cron patterns
grep -r "cron\|schedule\|setInterval\|setTimeout" .

# Search for node-cron usage
grep -r "node-cron\|cron.schedule" .

# Check package.json for cron dependencies
cat package.json | grep -i cron
```

#### Questions to Answer:
- [ ] Is news refresh automated?
- [ ] Are old alerts automatically cleaned up?
- [ ] Are there any background workers?
- [ ] What's the refresh frequency?

### 5. Authentication System

#### Admin Authentication:
- [ ] How is admin identified? (Token? Session? JWT?)
- [ ] Where is admin middleware defined?
- [ ] Which routes are protected?
- [ ] Is there role-based access control?

#### Check for:
```bash
# Search for authentication middleware
grep -r "auth\|authenticate\|requireAdmin" .

# Search for token verification
grep -r "ADMIN_TOKEN\|verifyToken" .

# Search for session management
grep -r "session\|jwt\|passport" .
```

### 6. External Integrations

#### Webhooks:
- [ ] Are there any webhook receivers?
- [ ] Do they write to database?

#### Third-party APIs:
- [ ] News API calls (CoinGecko, CryptoNews, etc.)
- [ ] Do any of them trigger database writes?

### 7. User-Facing Features

#### Check if users can:
- [ ] Create alerts (should be NO based on earlier conversation)
- [ ] Edit alerts
- [ ] Delete alerts
- [ ] Submit feedback/reports
- [ ] Update preferences
- [ ] Submit token requests (new feature to add)

### 8. Background Workers

#### Check for:
- [ ] Separate worker processes
- [ ] Queue systems (Bull, BullMQ, etc.)
- [ ] Message brokers (Redis, RabbitMQ)

```bash
# Search for worker/queue libraries
cat package.json | grep -i "bull\|queue\|worker\|redis"

# Search for worker files
find . -name "*worker*" -o -name "*queue*"
```

---

## Findings Template

### Endpoint Inventory

#### Admin Endpoints (Already Known):
```
✅ POST   /admin/alerts              - Create alert
✅ PUT    /admin/alerts/:id          - Update alert
✅ DELETE /admin/alerts/:id          - Delete alert
✅ POST   /admin/news/refresh        - Refresh news cache
✅ PUT    /admin/news/cache/:url     - Update news article
✅ DELETE /admin/news/cache/:url     - Delete news article
✅ POST   /admin/news/cache/bulk-delete - Bulk delete articles
```

#### User Endpoints (To Discover):
```
? GET  /api/alerts                   - Get alerts (READ - keep)
? GET  /api/news                     - Get news (READ - keep)
? POST /api/user/preferences         - Save user prefs (WRITE - keep?)
? PUT  /api/user/preferences         - Update prefs (WRITE - keep?)
? POST /api/feedback                 - Submit feedback (WRITE - keep?)
? Any others?
```

### Automated Processes

#### Cron Jobs:
```
? News refresh every X hours?
? Alert cleanup/expiry?
? Database maintenance?
? Cache cleanup?
```

### Authentication Status

#### Admin Auth:
```
? Middleware: requireAdmin() exists?
? Token type: ADMIN_TOKEN in env?
? Applied to: /admin/* routes?
? Implemented: YES / NO / PARTIAL
```

---

## Next Steps After Audit

1. **Document all findings** in this file
2. **Update ARCHITECTURE_REFACTOR_PROPOSAL.md** with real data
3. **Create migration plan** based on actual endpoints
4. **Identify safe-to-remove** vs **critical-to-keep** writes
5. **Plan testing strategy** for each endpoint change

---

## Questions for Production Team

### Critical Questions:
1. **Where is the CLG-DEPLOY repository?**
   - GitHub URL?
   - Access permissions?

2. **What automated processes are running?**
   - Cron jobs?
   - Background workers?
   - Scheduled tasks?

3. **Do users interact with the production app?**
   - What actions can they take?
   - Do any actions write to database?

4. **Is admin authentication implemented?**
   - How do admins authenticate?
   - What routes are protected?

5. **Are there any external webhooks?**
   - From third-party services?
   - Do they write to database?

6. **What's the deployment setup?**
   - Railway configuration?
   - Environment variables?
   - Database connection details?

---

## Audit Commands

### To Run in CLG-DEPLOY Repository:

```bash
# 1. Find all route definitions
echo "=== POST Endpoints ==="
grep -rn "\.post\(" . --include="*.js" | grep -v node_modules

echo "=== PUT Endpoints ==="
grep -rn "\.put\(" . --include="*.js" | grep -v node_modules

echo "=== DELETE Endpoints ==="
grep -rn "\.delete\(" . --include="*.js" | grep -v node_modules

echo "=== PATCH Endpoints ==="
grep -rn "\.patch\(" . --include="*.js" | grep -v node_modules

# 2. Find database operations
echo "=== Database Writes ==="
grep -rn "INSERT INTO\|UPDATE \|DELETE FROM" . --include="*.js" | grep -v node_modules

# 3. Find cron/scheduled tasks
echo "=== Scheduled Tasks ==="
grep -rn "cron\|schedule\|setInterval" . --include="*.js" | grep -v node_modules

# 4. Find authentication
echo "=== Authentication ==="
grep -rn "requireAdmin\|ADMIN_TOKEN\|authenticate" . --include="*.js" | grep -v node_modules

# 5. Check dependencies
echo "=== Package Dependencies ==="
cat package.json
```

---

**Status:** Ready for Audit  
**Prerequisites:** Access to CLG-DEPLOY repository  
**Estimated Time:** 2-4 hours for thorough audit  
**Output:** Complete endpoint inventory and architecture understanding
