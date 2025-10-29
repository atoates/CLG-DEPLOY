# Create Alert from News Feature

## Overview
You can now create alerts directly from news articles with pre-populated fields, making it quick and easy to convert important news into actionable alerts for users.

## How It Works

### 1. Find a News Article
1. Go to **News Feed** page
2. Browse or search for articles
3. Look for the green **Bell icon** button on each article

### 2. Click Create Alert
The green bell icon button opens a modal with pre-populated fields:

**Auto-populated fields:**
- **Token**: First ticker from article (e.g., BTC, ETH)
- **Title**: Article headline
- **Body**: Article text + source URL
- **Severity**: Auto-suggested based on sentiment
  - Negative sentiment → Warning
  - Positive/Neutral → Info
- **Tags**: Automatically includes "news"

### 3. Customize & Save
Adjust any fields as needed:
- Change token if article mentions multiple
- Edit title to be more user-friendly
- Adjust severity level
- Add more tags
- Set a deadline (optional)

### 4. Create Alert
Click **"Create Alert"** button and the alert is:
- ✅ Saved to database
- ✅ Immediately visible in Alerts page
- ✅ Available to users via API

## UI Location

### News Feed Article Card
```
[Article Title]
Article text preview...
[BTC] [ETH] tags

[🔔 Bell] [✏️ Edit] [🗑️ Delete]
   ↑
Create Alert button
```

## Form Fields

### Create Alert Modal
```
Token *             [BTC____________] (required)
                    Select from: BTC, ETH, SOL

Title *             [Article headline...] (required)

Body                [Article text...
                     Source: https://...]

Severity            [Info ▼]
                    Options: Info, Warning, Critical

Tags                [news, community, warning]
                    (comma-separated)

Deadline            [Optional datetime picker]

                    [Cancel]  [Create Alert]
```

## Backend Requirement

The backend needs a POST endpoint for creating alerts:

```javascript
POST /admin/alerts

Request body:
{
  "token": "BTC",
  "title": "Bitcoin Hits New High",
  "body": "Bitcoin reached $50,000...\n\nSource: https://...",
  "severity": "info",
  "tags": ["news", "community"],
  "deadline": "2025-12-31T23:59:59Z" // optional
}

Response: 201 Created
{
  "id": 145,
  "token": "BTC",
  "title": "Bitcoin Hits New High",
  ...
}
```

## Use Cases

### 1. Breaking News → Critical Alert
**Article**: "Bitcoin Exchange Hacked - $100M Stolen"
- Click bell icon
- Change severity to **Critical**
- Add tags: `hack, security, urgent`
- Set deadline: 24 hours
- Create alert

### 2. Price Movement → Info Alert
**Article**: "Bitcoin Surges Past $50,000"
- Click bell icon
- Keep severity as **Info**
- Add tags: `price, market`
- Create alert

### 3. Regulatory News → Warning
**Article**: "SEC Announces New Crypto Regulations"
- Click bell icon
- Change severity to **Warning**
- Add tags: `regulation, compliance`
- Set deadline: Regulation effective date
- Create alert

## Benefits

### Time Savings
- **Before**: Copy title, copy URL, switch to Alerts page, paste, fill form
- **After**: One click, minor edits, save

### Consistency
- Source URLs always included
- Tags automatically applied
- Severity suggestions based on sentiment

### Traceability
- Alerts include source article URL
- Users can verify information
- Audit trail maintained

## Tips

### 1. Choose the Right Token
If article mentions multiple tokens:
- Choose primary token affected
- Or create multiple alerts (one per token)

### 2. Edit Titles for Clarity
Make titles actionable:
- ❌ "Bitcoin Hits New High"
- ✅ "BTC Price Alert: New ATH at $50,000"

### 3. Add Context in Body
Enhance the auto-populated body:
- Add action items
- Include deadlines
- Link to related resources

### 4. Use Tags Effectively
Common tag combinations:
- `news, price` - Price movements
- `news, security, urgent` - Security issues
- `news, regulation, compliance` - Regulatory updates
- `news, community, migration` - Protocol changes

### 5. Set Appropriate Deadlines
When to use deadlines:
- ✅ Time-sensitive actions (migration, upgrade)
- ✅ Regulatory compliance dates
- ✅ Event reminders (hard fork, airdrop)
- ❌ General news updates
- ❌ Evergreen information

## Workflow Example

### Scenario: Convert CoinDesk article about Ethereum upgrade

1. **Read Article** in News Feed
   - Title: "Ethereum's Dencun Upgrade Goes Live"
   - Sentiment: Positive
   - Tickers: ETH

2. **Click Bell Icon** 🔔

3. **Review Pre-filled Form**
   ```
   Token: ETH ✓
   Title: "Ethereum's Dencun Upgrade Goes Live" ✓
   Body: "The Ethereum network has successfully...
         Source: https://coindesk.com/..." ✓
   Severity: Info
   Tags: news
   ```

4. **Customize**
   - Title → "ETH Alert: Dencun Upgrade Completed Successfully"
   - Severity → Info (keep)
   - Tags → "news, upgrade, ethereum, dencun"
   - Deadline → (leave empty)

5. **Create Alert** ✅

6. **Result**
   - Alert appears in Alerts page
   - Users with ETH in watchlist see it
   - Source URL preserved for verification

## Technical Details

### API Call Flow
```
User clicks Bell
    ↓
Modal opens with pre-filled data
    ↓
User customizes fields
    ↓
Click "Create Alert"
    ↓
POST /admin/alerts
    ↓
Alert saved to database
    ↓
Success message shown
    ↓
Modal closes
    ↓
Alerts cache invalidated
```

### Data Transformation
```javascript
// Article data
{
  title: "Bitcoin Hits $50,000",
  text: "Bitcoin price reached...",
  sentiment: "positive",
  tickers: ["BTC", "ETH"],
  article_url: "https://coindesk.com/..."
}

// Transformed to alert form
{
  token: "BTC",              // First ticker
  title: "Bitcoin Hits $50,000",
  body: "Bitcoin price reached...\n\nSource: https://coindesk.com/...",
  severity: "info",          // positive → info
  tags: ["news"],
  deadline: ""
}
```

### Validation
- ✅ Token required (min 1 char)
- ✅ Title required (min 1 char)
- ✅ Body optional
- ✅ Severity must be: info | warning | critical
- ✅ Tags can be empty array
- ✅ Deadline must be valid ISO datetime or empty

## Future Enhancements

### Possible Improvements
1. **Bulk Alert Creation**
   - Select multiple articles
   - Create alerts for each
   - One click for batch processing

2. **Alert Templates**
   - Save common alert formats
   - Apply template to news article
   - Faster creation for recurring patterns

3. **Smart Suggestions**
   - AI-powered severity detection
   - Automatic tag suggestions
   - Token extraction from text

4. **Preview Mode**
   - See how alert looks to users
   - Preview before saving
   - Test notification appearance

5. **Duplicate Detection**
   - Check if similar alert exists
   - Warn before creating duplicate
   - Merge with existing alert option

## Troubleshooting

### Issue: Create Alert button grayed out
**Cause**: Token or Title field is empty
**Fix**: Fill in both required fields

### Issue: Alert not appearing in Alerts page
**Cause**: Cache not refreshed
**Fix**: Refresh browser or wait for React Query cache to update

### Issue: "Unauthorized" error
**Cause**: Admin token expired
**Fix**: Logout and login again

### Issue: Source URL not showing
**Cause**: Article text is null/empty
**Fix**: Manually add URL in body field

## Success Metrics

Track these to measure feature adoption:
- **Alerts created from news**: Count per day/week
- **Time saved**: Compare old vs new flow
- **Alert quality**: User engagement with news-based alerts
- **Conversion rate**: Articles viewed → Alerts created

---

**Status**: ✅ Deployed  
**Version**: 1.0  
**Date**: October 29, 2025  
**Location**: News Feed page → Bell icon on each article
