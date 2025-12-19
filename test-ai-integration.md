# AI Integration Test Guide

## Prerequisites

1. ✅ Database migration completed
2. ✅ DeepSeek API key configured in `.env`
3. ✅ Server running on port 3001
4. ✅ Valid JWT token for authentication

## Test Steps

### Step 1: Verify Server is Running

```bash
# Start the server
npm run dev

# Expected output:
# Server running on port 3001
```

### Step 2: Create Test User & Get Token

If you don't have a token, register/login first:

```bash
# Register
curl -X POST http://localhost:3001/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'

# Login
curl -X POST http://localhost:3001/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# Save the accessToken from response
```

### Step 3: Upload a Test File

Create a test agreement file or use an existing one:

```bash
# Upload PDF
curl -X POST http://localhost:3001/api/file \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@/path/to/agreement.pdf"

# Expected response:
{
  "id": 1,
  "userId": 1,
  "filename": "agreement.pdf",
  "filetype": "application/pdf",
  "filesize": 123456,
  "filepath": "http://localhost:3001/api/uploads/1234567890_agreement.pdf",
  "extractedText": "Market Maker Agreement...",
  "createdAt": "2025-12-18T10:00:00.000Z"
}
```

**Save the file `id` from the response!**

### Step 4: Trigger AI Analysis

```bash
# Replace {fileId} with the actual file ID from Step 3
curl -X POST http://localhost:3001/api/file/1/analyze \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"

# This will take 6-20 seconds to complete
```

### Step 5: Verify Analysis Results

Expected response structure:

```json
{
  "success": true,
  "extractedFacts": {
    "terminationRights": "equal",
    "sameNoticePeriod": true,
    "noticePeriodDays": 30,
    "windDownDays": 14,
    "windDownDefined": true,
    "forceMajeure": "equalCoverage",
    "fdv": 1500000000,
    "allocationSize": 0.5,
    "exchange": "Binance",
    "maxSpread": 0.2,
    "exercisePeriodMonths": 12,
    "unlockSchedule": "linearOrStructured",
    "strikePrice": "indexedToFMV",
    "premiumPercent": 15,
    "clawback": "strong",
    "kpiClarity": "clearAndMeasurable",
    "reporting": "realTimeOrDaily",
    "kpiAdaptability": "someFlexibility",
    "remedyStructure": "graduated",
    "curePeriodDays": 30,
    "disputeResolution": "arbitration",
    "assetProtection": "clearSegregation",
    "feeStructure": "performanceBased",
    "exclusivityMonths": 0
  },
  "scoringResult": {
    "totalScore": 87.5,
    "grade": "A-",
    "gradeDescription": "Very Good - Well-balanced agreement",
    "metrics": {
      "agreementStructure": {
        "score": 90.5,
        "maxPossible": 100,
        "achieved": 90.5,
        "components": { /* ... */ }
      },
      "tokenEconomics": { /* ... */ },
      "performanceMonitoring": { /* ... */ },
      "riskProtections": { /* ... */ }
    },
    "flags": [],
    "recommendations": [
      "Equal termination rights with same notice period",
      "30-60 days notice with clear wind-down"
    ],
    "tierInfo": {
      "fdvTier": "LargeCap",
      "fdvTierLabel": "FDV ≥ $1B",
      "exchangeTier": "TierS",
      "exchangeTierLabel": "Premium",
      "fdvValue": 1500000000,
      "exchangeName": "Binance"
    },
    "findings": [
      {
        "severity": "Low",
        "category": "Termination Rights",
        "title": "Market termination rights",
        "description": "30–60 days notice with clear 7–30 day wind-down procedures.",
        "recommendation": "Ensure wind-down procedures are well defined and practical.",
        "metric": "agreementStructure",
        "component": "termination"
      },
      {
        "severity": "Low",
        "category": "Vesting Terms",
        "title": "Strong clawback provisions",
        "description": "Strong clawback provisions tied to performance milestones with automatic triggers.",
        "recommendation": "Maintain robust clawback mechanisms to ensure accountability.",
        "metric": "tokenEconomics",
        "component": "clawback"
      }
    ]
  }
}
```

### Step 6: Retrieve Saved Review

```bash
# Get all reviews for the file
curl http://localhost:3001/api/review/1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Expected response:
[
  {
    "id": 1,
    "fileId": 1,
    "content": {
      "totalScore": 87.5,
      "metrics": { /* ... */ },
      "flags": [],
      "recommendations": [ /* ... */ ]
    },
    "createdAt": "2025-12-18T10:05:00.000Z"
  }
]
```

### Step 7: Get All Files

```bash
curl http://localhost:3001/api/files \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Should show all uploaded files with extractedText
```

## Common Issues & Solutions

### Issue 1: "DEEPSEEK_API_KEY is not configured"

**Solution:**
```bash
# Add to .env file
DEEPSEEK_API_KEY=sk-your-actual-key-here
```

### Issue 2: "File has no extracted text"

**Cause:** Text extraction failed during upload

**Solution:**
- Ensure file is a valid PDF, DOCX, or TXT
- Check file is not corrupted
- Verify file contains readable text (not just images)

### Issue 3: "AI extraction service unavailable"

**Cause:** DeepSeek API timeout or error

**Solutions:**
- Check internet connection
- Verify API key is valid
- Check DeepSeek API status
- Try again (API might be temporarily unavailable)

### Issue 4: TypeScript errors with pdf-parse

**Solution:** Already handled with `require()` syntax in fileController.ts

### Issue 5: "Unauthorized" or "Forbidden"

**Solutions:**
- Ensure JWT token is valid and not expired
- Include `Authorization: Bearer <token>` header
- Verify you're the owner of the file

## Performance Benchmarks

Expected timing for typical market maker agreement (10-20 pages):

- **File Upload + Text Extraction:** 1-3 seconds
- **AI Fact Extraction:** 5-15 seconds
- **Scoring Calculation:** <100ms
- **Total Analysis Time:** 6-20 seconds

## Swagger Documentation

Access interactive API docs at:
```
http://localhost:3001/api-docs
```

Look for the new endpoint:
- **POST /api/file/{fileId}/analyze** - Analyze a market maker agreement file with AI

## Database Verification

Check the database to verify data is saved:

```sql
-- Check files with extracted text
SELECT id, filename, LENGTH(extractedText) as text_length 
FROM "File" 
WHERE extractedText IS NOT NULL;

-- Check extracted facts
SELECT * FROM "ExtractedFact";

-- Check reviews (scores)
SELECT id, fileId, content->>'totalScore' as score, content->>'grade' as grade
FROM "Review";
```

## Success Criteria

✅ File uploads successfully with extracted text
✅ Analysis completes without errors
✅ Response includes extractedFacts with 24 fields
✅ Response includes scoringResult with grade
✅ Findings array contains severity-based recommendations
✅ Review is saved to database
✅ Can retrieve review by fileId

## Next Steps

After successful testing:

1. Test with various agreement types
2. Verify scoring accuracy
3. Test error handling (invalid files, missing API key)
4. Load testing (multiple concurrent analyses)
5. Frontend integration
6. User feedback collection

## Support

For issues or questions:
- Check `AI_INTEGRATION.md` for detailed documentation
- Review `INTEGRATION_SUMMARY.md` for overview
- Check server logs for detailed error messages
