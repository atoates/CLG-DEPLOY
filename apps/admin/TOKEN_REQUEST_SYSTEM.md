# Token Request System - Design Document

## Overview

Users of the production app can submit token requests (not alerts). These requests are reviewed and approved/rejected by admins in the admin panel.

---

## Database Schema

### New Table: `token_requests`

```sql
CREATE TABLE token_requests (
  id SERIAL PRIMARY KEY,
  
  -- User Information
  user_id VARCHAR(255),           -- User identifier (could be wallet address, email, etc.)
  
  -- Token Details
  token_symbol VARCHAR(20) NOT NULL,
  token_name VARCHAR(255) NOT NULL,
  blockchain VARCHAR(50) NOT NULL,
  contract_address VARCHAR(255),
  
  -- Request Details
  reason TEXT,                    -- Why user wants this token added
  additional_info JSONB,          -- Flexible field for extra data
  
  -- Status Tracking
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  -- Status values: 'pending', 'approved', 'rejected', 'spam'
  
  -- Timestamps
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  
  -- Admin Actions
  reviewed_by VARCHAR(255),       -- Admin who reviewed the request
  admin_notes TEXT,               -- Internal notes by admin
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_token_requests_status ON token_requests(status);
CREATE INDEX idx_token_requests_submitted_at ON token_requests(submitted_at DESC);
CREATE INDEX idx_token_requests_user_id ON token_requests(user_id);
```

---

## API Endpoints

### Production App (User-Facing)

#### Submit Token Request
```
POST /api/token-requests
```

**Request Body:**
```json
{
  "user_id": "optional_user_identifier",
  "token_symbol": "MYTOKEN",
  "token_name": "My Token Name",
  "blockchain": "ethereum",
  "contract_address": "0x123...",
  "reason": "This token has significant trading volume..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token request submitted successfully",
  "request_id": 123
}
```

---

### Admin Panel

#### Get All Token Requests
```
GET /admin/token-requests
```

**Query Parameters:**
- `status`: Filter by status (pending, approved, rejected, spam)
- `limit`: Number of results (default 50)
- `offset`: Pagination offset

**Response:**
```json
{
  "requests": [
    {
      "id": 1,
      "user_id": "user123",
      "token_symbol": "MYTOKEN",
      "token_name": "My Token Name",
      "blockchain": "ethereum",
      "contract_address": "0x123...",
      "reason": "This token...",
      "status": "pending",
      "submitted_at": "2025-10-29T10:00:00Z",
      "reviewed_at": null,
      "reviewed_by": null,
      "admin_notes": null
    }
  ],
  "total": 42,
  "pending_count": 15
}
```

#### Update Token Request Status
```
PUT /admin/token-requests/:id
```

**Request Body:**
```json
{
  "status": "approved",
  "admin_notes": "Verified contract, good liquidity"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token request updated",
  "request": { /* updated request object */ }
}
```

#### Bulk Actions
```
POST /admin/token-requests/bulk-action
```

**Request Body:**
```json
{
  "action": "reject",
  "request_ids": [1, 2, 3],
  "admin_notes": "Spam requests"
}
```

---

## Admin Panel UI

### New Tab: "Token Requests"

**Features:**

1. **Request List View**
   - Table showing all token requests
   - Columns: Symbol, Name, Blockchain, Status, Submitted Date, User ID
   - Filter by status (All, Pending, Approved, Rejected)
   - Sort by submission date
   - Search by token symbol/name

2. **Request Details Modal**
   - Full token information
   - Contract address (with link to explorer)
   - User's reason
   - Submission timestamp
   - Admin action buttons: Approve, Reject, Mark as Spam
   - Admin notes field
   - History of status changes (if available)

3. **Bulk Actions**
   - Select multiple requests
   - Bulk approve/reject/mark as spam
   - Bulk delete old rejected requests

4. **Statistics Dashboard**
   - Total requests (all time)
   - Pending requests count
   - Approval rate
   - Most requested blockchains
   - Recent activity chart

---

## Production App Integration

### User Flow

1. User visits production app
2. Clicks "Request Token" button
3. Fills out form:
   - Token Symbol
   - Token Name
   - Blockchain (dropdown)
   - Contract Address (optional)
   - Reason (textarea)
4. Submits request
5. Gets confirmation message
6. (Optional) Can check request status later

### UI Placement

Options:
- **Dedicated "Request Token" page**
- Button in header/navigation
- Link in footer
- Modal accessible from anywhere

---

## Admin Workflow

1. Admin logs into CLG-ADMIN
2. Navigates to "Token Requests" tab
3. Sees list of pending requests (default filter)
4. Clicks on a request to view details
5. Reviews token information:
   - Checks contract on blockchain explorer
   - Verifies token legitimacy
   - Reads user's reason
6. Takes action:
   - **Approve**: Token gets added to system (manual or automatic)
   - **Reject**: Request is declined, user can be notified
   - **Mark as Spam**: For obviously fake/spam requests
7. Adds admin notes for record-keeping
8. Request is updated in database

---

## Implementation Phases

### Phase 1: Database & Backend (1-2 days)
- [ ] Create `token_requests` table
- [ ] Add migration script
- [ ] Implement POST `/api/token-requests` (production)
- [ ] Implement GET `/admin/token-requests` (admin)
- [ ] Implement PUT `/admin/token-requests/:id` (admin)
- [ ] Add authentication middleware
- [ ] Test endpoints

### Phase 2: Admin Panel UI (2-3 days)
- [ ] Create `TokenRequests.tsx` page
- [ ] Add to navigation/routing
- [ ] Build request list table
- [ ] Add filters and sorting
- [ ] Create request details modal
- [ ] Implement approve/reject actions
- [ ] Add admin notes functionality
- [ ] Test UI thoroughly

### Phase 3: Production App Integration (1-2 days)
- [ ] Create "Request Token" form UI
- [ ] Implement form validation
- [ ] Connect to POST endpoint
- [ ] Add success/error handling
- [ ] Test user flow
- [ ] Add rate limiting (prevent spam)

### Phase 4: Enhancements (Optional)
- [ ] Email notifications to admins for new requests
- [ ] User notifications when request is approved/rejected
- [ ] Automatic token addition on approval
- [ ] Duplicate detection (same token requested multiple times)
- [ ] Analytics and reporting

---

## Security Considerations

1. **Rate Limiting**: Prevent spam submissions (max 5 requests per user per day)
2. **Input Validation**: Sanitize all user inputs
3. **Contract Verification**: Validate contract addresses match blockchain format
4. **Admin Authentication**: Ensure only admins can approve/reject
5. **Audit Trail**: Log all admin actions for accountability

---

## Questions to Resolve

1. **User Identification**: How do we identify users?
   - Wallet address?
   - Email?
   - Anonymous submissions allowed?

2. **Automatic Token Addition**: Should approval automatically add token to system?
   - Or is this a manual step after approval?

3. **User Notifications**: Do users get notified of request status?
   - Email?
   - In-app notification?
   - Check status page?

4. **Duplicate Handling**: What if same token is requested multiple times?
   - Show existing requests?
   - Allow duplicate submissions?

5. **Request Expiry**: Do old requests expire?
   - Auto-reject after X days?
   - Keep forever?

---

## Migration Script

```sql
-- migrations/010_create_token_requests.sql

BEGIN;

CREATE TABLE IF NOT EXISTS token_requests (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  token_symbol VARCHAR(20) NOT NULL,
  token_name VARCHAR(255) NOT NULL,
  blockchain VARCHAR(50) NOT NULL,
  contract_address VARCHAR(255),
  reason TEXT,
  additional_info JSONB,
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR(255),
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_token_requests_status ON token_requests(status);
CREATE INDEX idx_token_requests_submitted_at ON token_requests(submitted_at DESC);
CREATE INDEX idx_token_requests_user_id ON token_requests(user_id);

COMMIT;
```

---

**Status:** Design Phase  
**Next Steps:** Review design, answer questions, begin implementation  
**Estimated Total Effort:** 5-8 days
