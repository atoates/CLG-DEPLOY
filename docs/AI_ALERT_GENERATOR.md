# AI-Assisted Alert Generator

## ✨ Feature Overview

The AI-Assisted Alert Generator uses OpenAI's GPT-4o-mini model to automatically analyze news articles and generate smart, pre-populated alerts with optimal severity levels, tags, and descriptions.

## 🎯 How It Works

### User Flow
1. **Click Bell icon** on any news article in the News Feed
2. **Modal opens** with basic pre-populated data
3. **Click "Generate Smart Alert with AI"** button (purple gradient)
4. **AI analyzes** the article and generates:
   - Optimal token selection
   - Concise, actionable title (max 80 chars)
   - Detailed description with key facts
   - Appropriate severity level (critical/warning/info)
   - Relevant tags
   - Time-sensitive deadline (if applicable)
   - Reasoning for severity choice
5. **Review and edit** the AI-generated content
6. **Save** to create the alert

### AI Analysis Criteria

**Severity Levels:**
- **Critical**: Security breaches, exploits, major hacks, exchange failures, regulatory bans
- **Warning**: Price volatility, upcoming deadlines, potential risks, regulatory concerns
- **Info**: General news, updates, new features, partnerships, price movements

**Smart Features:**
- Summarizes key facts in 2-4 sentences
- Identifies primary affected token
- Generates relevant tags (security, hack, exploit, price, regulation, etc.)
- Suggests deadlines for time-sensitive issues
- Provides reasoning for severity classification

## 🔧 Technical Implementation

### Frontend Components

**File: `src/lib/aiAlertGenerator.ts`**
- Core AI generation logic
- OpenAI API integration
- Fallback handling if AI fails
- Type-safe response parsing

**File: `src/pages/NewsFeed.tsx`**
- AI generation button in alert modal
- Loading state handling
- AI reasoning display
- Integration with existing alert creation flow

### API Integration

**Model:** GPT-4o-mini (cost-effective, fast)  
**Temperature:** 0.3 (consistent, focused responses)  
**Max Tokens:** 500 (concise alerts)  
**Format:** JSON mode (structured, reliable output)

### Configuration

**Environment Variable:**
```bash
VITE_OPENAI_API_KEY=sk-proj-...
```

**Check if AI is enabled:**
```typescript
import { isAIEnabled } from '../lib/aiAlertGenerator'

if (isAIEnabled()) {
  // Show AI button
}
```

## 📊 Example AI-Generated Alert

**Input Article:**
```json
{
  "title": "Major Security Vulnerability Discovered in Ethereum Smart Contract",
  "text": "Security researchers have identified a critical vulnerability in a popular DeFi protocol...",
  "sentiment": "negative",
  "tickers": ["ETH", "DeFi"]
}
```

**AI-Generated Output:**
```json
{
  "token": "ETH",
  "title": "Critical Security Vulnerability in DeFi Protocol - Immediate Action Required",
  "body": "Security researchers discovered a critical vulnerability in a popular Ethereum DeFi protocol that could allow attackers to drain user funds. The exploit affects smart contracts deployed on mainnet. Users are advised to withdraw funds immediately and avoid interacting with the protocol until a patch is deployed.\n\nSource: https://article-url.com",
  "severity": "critical",
  "tags": ["security", "vulnerability", "defi", "ethereum", "exploit"],
  "deadline": "2025-10-31T23:59:59Z",
  "reasoning": "Classified as critical due to immediate security risk with potential for fund loss and active exploit possibility"
}
```

## 🎨 UI Components

### AI Generation Button
- **Location**: Top of Create Alert modal
- **Style**: Purple-to-blue gradient with sparkles icon
- **States**: 
  - Normal: "Generate Smart Alert with AI"
  - Loading: "AI is analyzing article..." (spinning icon)
  - Disabled: When no OpenAI key configured

### AI Reasoning Display
- Shows below the button when AI generates content
- Purple-bordered info box
- Explains why AI chose the severity level
- Helps users understand the AI's decision-making

## 🔐 Security & Privacy

### API Key Management
- Stored in `.env` file (git-ignored)
- Never committed to repository
- Client-side API calls (browser → OpenAI directly)
- Example file: `.env.example`

### Fallback Behavior
If AI generation fails:
1. Catches error gracefully
2. Shows user-friendly error message
3. Falls back to basic pre-population
4. Logs error to console for debugging
5. User can still edit manually

## 💰 Cost Estimation

**GPT-4o-mini Pricing:**
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens

**Per Alert Generation:**
- Average input: ~300 tokens (article text)
- Average output: ~200 tokens (alert)
- Cost per alert: ~$0.00015 (negligible)

**Monthly Estimate:**
- 1,000 AI-generated alerts/month
- Total cost: ~$0.15/month
- Extremely cost-effective!

## 🧪 Testing

### Test Scenarios

1. **Basic Generation**
   - Click AI button
   - Verify all fields populate
   - Check reasoning appears

2. **Error Handling**
   - Remove API key
   - AI button should not appear
   - Manual mode still works

3. **Long Articles**
   - Test with lengthy news text
   - Verify summarization quality
   - Check token limits

4. **Edge Cases**
   - No article text (title only)
   - Multiple tickers
   - Unknown sentiment
   - Special characters in text

### Manual Testing Checklist
- [ ] AI button appears when API key configured
- [ ] Button shows loading state during generation
- [ ] Generated alerts are coherent and relevant
- [ ] Severity levels make sense
- [ ] Tags are appropriate
- [ ] Deadlines suggested for urgent issues
- [ ] Reasoning is helpful
- [ ] Can edit AI-generated content before saving
- [ ] Fallback works if API fails
- [ ] Button hidden when no API key

## 🚀 Deployment

### Development
```bash
# Install dependencies
npm install

# Add OpenAI key to .env
echo "VITE_OPENAI_API_KEY=sk-proj-..." >> .env

# Run dev server
npm run dev
```

### Production (Railway)

**Environment Variables:**
Add to Railway dashboard:
```
VITE_OPENAI_API_KEY=sk-proj-...
```

**Build automatically includes:**
- AI generation module
- OpenAI API integration
- Smart alert features

## 📈 Future Enhancements

### Potential Features
- [ ] Multi-language support
- [ ] Custom prompt templates per user
- [ ] Learning from user edits
- [ ] Batch alert generation
- [ ] AI-suggested related articles
- [ ] Sentiment analysis refinement
- [ ] Token price impact prediction
- [ ] Historical alert performance tracking

### Advanced AI Features
- [ ] GPT-4 option for complex analysis
- [ ] Claude integration as alternative
- [ ] Local model option (privacy-focused)
- [ ] Fine-tuned model on crypto news
- [ ] Real-time market data integration

## 🐛 Troubleshooting

### AI Button Not Appearing
**Problem:** Button doesn't show in modal  
**Solution:** Check `VITE_OPENAI_API_KEY` in `.env`

### Generation Fails
**Problem:** "AI generation failed" error  
**Solution:** 
1. Verify API key is valid
2. Check OpenAI account has credits
3. Check browser console for detailed error
4. Verify network connectivity

### Poor Quality Output
**Problem:** AI generates irrelevant alerts  
**Solution:**
1. Check article has sufficient text
2. Verify article is crypto-related
3. Adjust temperature in `aiAlertGenerator.ts`
4. Review prompt engineering

### Rate Limits
**Problem:** "Too many requests" error  
**Solution:**
1. Implement request throttling
2. Add retry logic with backoff
3. Consider caching for similar articles
4. Upgrade OpenAI tier if needed

## 📚 Related Documentation

- [NEWS_MANAGEMENT.md](./NEWS_MANAGEMENT.md) - News system overview
- [CREATE_ALERT_FROM_NEWS.md](./CREATE_ALERT_FROM_NEWS.md) - Manual alert creation
- [NEWS_ALERT_TRACKING_COMPLETE.md](./NEWS_ALERT_TRACKING_COMPLETE.md) - Alert tracking

## ✅ Benefits

✅ **Time Saving**: Generate alerts in 2-3 seconds vs. 2-3 minutes manually  
✅ **Consistency**: Standardized format and quality across all alerts  
✅ **Accuracy**: AI analyzes full article context for optimal severity  
✅ **Intelligence**: Smart tag selection and deadline suggestions  
✅ **Scalability**: Handle high volume of news efficiently  
✅ **Learning**: AI reasoning helps users understand severity levels  

---

*Last Updated: October 29, 2025*
