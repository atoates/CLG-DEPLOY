# Crypto Lifeguard - AI Development Guide

## Project Overview
Crypto Lifeguard is a web application for tracking crypto token alerts with severity levels and deadlines. The project consists of:
- Express.js backend with SQLite database (`server.js`)
- Vite-based frontend (`src/` directory)
- Database migrations and management scripts

## Key Architecture Components

### Data Layer
- SQLite database using `better-sqlite3` with WAL journaling mode
- Core tables:
  - `alerts`: Main alert data with severity and tags
  - `users`: User identities
  - `user_prefs`: User preferences including watchlists
- Alert severity levels: 'critical', 'warning', 'info' with associated default tags
- Tags stored as JSON string arrays

### Backend (server.js)
- Express server with environment-configurable paths:
  - `DATA_DIR`: Base directory for data storage (default: './data')
  - `DATABASE_PATH`: SQLite database location
  - `BACKUP_DIR`: Backup storage location
  - `POLYGON_API_KEY`: For external data integration

### API Endpoints
- `/api/me`: User preferences and watchlist management
  - GET: Retrieves user preferences with defaults
  - PUT: Updates preferences (watchlist, severity filters, dismissed items)
- `/api/alerts`: Alert management
  - GET: Filtered alerts based on user preferences
  - POST: Create new alerts (requires admin token)

### Authentication
- Anonymous users identified by cookie-based UIDs
- Admin operations protected by `ADMIN_TOKEN` environment variable
- Cookie settings: HTTPOnly, SameSite=Lax, 1-year expiry

## Development Workflow

### Local Development
```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server (runs migrations, restores alerts, updates tags)
npm run start
```

### Database Management
```bash
# Run migrations
npm run migrate

# Backup database 
npm run backup   # Creates timestamped backup in BACKUP_DIR

# Update alert tags
npm run update-tags
```

### Deployment
- Production deployment via Railway.app
- Procfile defines startup sequence:
  1. Run migrations
  2. Restore alerts from backup
  3. Update tags
  4. Start server

## Project Conventions

### Alert Severity Levels
- 🚨 Critical: Default tags: ["hack", "exploit"]
- ⚠️ Warning: Default tags: ["community", "migration"]
- 🛟 Info: Default tags: ["community", "news"]

### Data Validation
- Tags are always stored as JSON string arrays
- Invalid tag formats are converted to empty arrays (`[]`)
- Token symbols follow A-Z/0-9 format validation
- User preferences (watchlist, dismissed items) stored as JSON strings in database

### Database Operations
- Uses WAL journaling mode for concurrent access
- Backups performed using VACUUM INTO when available
- Fallback to file copy for older SQLite versions
- Transactions wrap critical operations

## Integration Points
- External API integration with Polygon.io (configured via `POLYGON_API_KEY`)
- Local storage for persisting user token selections in browser
- SQLite WAL mode enables concurrent read/write operations
- Railway.app deployment integration

## Error Handling
- Database operations use transactions for data integrity
- Tag parsing includes fallback to empty array on invalid JSON
- Environment variables include sensible defaults for local development
- Database backup includes fallback mechanisms
- Safe JSON read/write operations with fallback values

For questions or clarifications about these patterns, check implementations in `server.js` and migration files.