# AI Review System Integration

## Overview

The honestMM-Backend now includes an AI-powered review system for analyzing market maker agreements. This system follows the same architecture as the market-maker-agreement-analyzer, using DeepSeek AI for fact extraction and a rule-based scoring engine for evaluation.

## Architecture

### 3-Step Pipeline

```
File Upload → Text Extraction → AI Fact Extraction → Rule-Based Scoring → Review Generation
```

### Key Components

1. **Text Extraction** (`fileController.ts`)
   - Supports PDF, DOCX, and TXT files
   - Extracts text during file upload
   - Stores extracted text in database

2. **AI Extraction Service** (`services/aiExtractionService.ts`)
   - Uses DeepSeek API for intelligent fact extraction
   - Extracts 24+ contractual terms
   - Conservative classification approach
   - Temperature: 0.1 for consistency

3. **Scoring Engine** (`services/scoringEngine.ts`)
   - Rule-based evaluation system
   - 4 main metric categories (25% weight each):
     - Agreement Structure & Balance
     - Token Economics & Allocation
     - Performance & Monitoring
     - Risk & Protections
   - FDV-tier and Exchange-tier dependent scoring
   - Generates findings with severity levels (Critical/High/Medium/Low)

4. **Metrics Configuration** (`config/metrics.json`)
   - 716 lines of scoring rules
   - FDV tiers: Large Cap, Mid Cap, Small Cap, Micro Cap
   - Exchange tiers: Premium, Major, Mid-Tier, Smaller
   - Component-based scoring with conditions

## Database Schema

### New Models

```prisma
model File {
  extractedText String? @db.Text
  extractedFact ExtractedFact?
  // ... existing fields
}

model ExtractedFact {
  id        Int      @id @default(autoincrement())
  fileId    Int      @unique
  file      File     @relation(fields: [fileId], references: [id])
  facts     Json
  createdAt DateTime @default(now())
}
```

## API Endpoints

### Upload File
```
POST /api/file
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body: { file: <binary> }

Response: {
  id: number,
  filename: string,
  extractedText: string | null,
  ...
}
```

### Analyze File
```
POST /api/file/:fileId/analyze
Authorization: Bearer <token>

Response: {
  success: true,
  extractedFacts: {
    terminationRights: string,
    noticePeriodDays: number,
    fdv: number,
    clawback: string,
    // ... 20+ more fields
  },
  scoringResult: {
    totalScore: number,
    grade: string,
    gradeDescription: string,
    metrics: { ... },
    findings: [
      {
        severity: "Critical" | "High" | "Medium" | "Low",
        category: string,
        title: string,
        description: string,
        recommendation: string
      }
    ],
    tierInfo: { ... }
  }
}
```

### Get Reviews
```
GET /api/review/:fileId
Authorization: Bearer <token>

Response: [
  {
    id: number,
    fileId: number,
    content: {
      totalScore: number,
      metrics: { ... },
      flags: string[],
      recommendations: string[]
    },
    createdAt: string
  }
]
```

## Setup Instructions

### 1. Install Dependencies
```bash
npm install axios pdf-parse mammoth @types/pdf-parse
```

### 2. Configure Environment
Add to `.env`:
```
DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

Get your API key from: https://platform.deepseek.com/

### 3. Run Database Migration
```bash
npx prisma migrate dev --name add_extracted_text_and_facts
npx prisma generate
```

### 4. Start Server
```bash
npm run dev
```

## Extracted Facts

The AI extracts the following contractual terms:

### Agreement Structure
- `terminationRights`: equal | minorAsymmetry | someImbalance | heavilyFavorsOne | oneSided | noProjectRights
- `sameNoticePeriod`: boolean
- `noticePeriodDays`: number
- `windDownDays`: number
- `windDownDefined`: boolean
- `forceMajeure`: equalCoverage | standardWithMinorGaps | basic | weakOrOneSided

### Token Economics
- `fdv`: number (Fully Diluted Valuation)
- `allocationSize`: number (percentage)
- `exchange`: string
- `maxSpread`: number
- `exercisePeriodMonths`: number
- `unlockSchedule`: linearOrStructured | reasonable | partialEarly | unrestricted
- `strikePrice`: indexedToFMV | modestPremium | flat | discounted | highlyFavorable
- `premiumPercent`: number
- `clawback`: strong | moderate | basic | weak

### Performance & Monitoring
- `kpiClarity`: clearAndMeasurable | wellDefinedMinorAmbiguities | generallyClear | basicWithGaps | vagueOrNone
- `reporting`: realTimeOrDaily | regular | basic | unclearOrNone
- `kpiAdaptability`: automatic | someFlexibility | fixed

### Risk & Protections
- `remedyStructure`: graduated | clear | basic | harsh | excessiveOrNone
- `curePeriodDays`: number
- `disputeResolution`: arbitration | definedProcess | basic | unclearOrUnfavorable
- `assetProtection`: clearSegregation | basic | limited | unclearOrInadequate
- `feeStructure`: performanceBased | mixedReasonable | acceptableWithConcerns | excessiveOrUnfair
- `exclusivityMonths`: number

## Scoring System

### Grade Scale
- **A+ (95-100)**: Exceptional - Industry-leading terms
- **A (90-94)**: Excellent - Strong protections
- **A- (85-89)**: Very Good - Well-balanced
- **B+ (80-84)**: Good - Reasonable terms
- **B (75-79)**: Acceptable - Some concerns
- **B- (70-74)**: Fair - Notable issues
- **C+ (65-69)**: Below Average - Significant concerns
- **C (60-64)**: Poor - Major issues
- **C- (55-59)**: Very Poor - Critical problems
- **D (50-54)**: Unacceptable - Severe risks
- **F (<50)**: Failing - Extremely unfavorable

### Tier-Based Scoring

The system adjusts scoring based on:
- **FDV Tiers**: Different allocation size expectations for different market caps
- **Exchange Tiers**: Different spread expectations for different exchange quality

## Error Handling

The system handles:
- Missing or corrupted files
- Text extraction failures
- AI API timeouts
- Invalid JSON responses
- Missing required fields (filled with null)
- Unauthorized access attempts

## Usage Example

```typescript
// 1. Upload a file
const formData = new FormData();
formData.append('file', file);

const uploadResponse = await fetch('/api/file', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const { id: fileId } = await uploadResponse.json();

// 2. Analyze the file
const analysisResponse = await fetch(`/api/file/${fileId}/analyze`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

const { extractedFacts, scoringResult } = await analysisResponse.json();

console.log(`Grade: ${scoringResult.grade}`);
console.log(`Score: ${scoringResult.totalScore}`);
console.log(`Findings: ${scoringResult.findings.length}`);
```

## Performance Considerations

- Text extraction: ~1-3 seconds for typical documents
- AI extraction: ~5-15 seconds (depends on DeepSeek API)
- Scoring: <100ms (local computation)
- Total analysis time: ~6-20 seconds

## Security

- All endpoints require JWT authentication
- File ownership verified before analysis
- API keys stored in environment variables
- No sensitive data logged

## Future Enhancements

- [ ] Support for more file formats (HTML, RTF)
- [ ] Batch analysis for multiple files
- [ ] Custom metrics configuration per user
- [ ] Historical comparison of agreements
- [ ] Export analysis reports (PDF, Excel)
- [ ] Real-time analysis progress updates via WebSocket
