# README - Pragmatic Payments Infrastructure for Asia

## 🎯 What This Is

A minimal, pragmatic payments infrastructure designed for Phase 1 ("The Plumbing"):
- Connect **1 Bank + 1 Merchant**
- Manually verify **every transaction**
- Build for the error state (when partner APIs fail)
- Optimize for **visibility**, not concurrency

This is not a service mesh. This is a **technical service provider gateway** that answers one question: *"Where did that $42,000 go?"*

## 🏗️ Architecture

### The Stack (Boring, On Purpose)
- **PostgreSQL** - Ledger, task queue (via `SKIP LOCKED`), state machine
- **Express.js** - REST API (synchronous, blocking calls for visibility)
- **TypeScript** - Type safety to catch errors during development
- **Zod** - Runtime validation of all inputs

### Why Not Temporal/Kafka?
A team of 4 can't afford the operational overhead while finding product-market fit.

### Core Concepts

**The Three Constants:**
1. **Human-in-the-Loop** - Transactions > $500 require manual approval (regulatory requirement)
2. **Shadow Ledger** - Every partner API call is logged BEFORE processing (dispute resolution)
3. **Circuit Breaker** - Prevent duplicate payments in 10-minute windows (basic fraud detection)

## 📊 Data Model

### Transactions Table
- Core ledger (DEBIT/CREDIT)
- Status flow: `pending` → `requires_approval` → `approved` → `processing` → `completed`
- Tracks who approved and when (human audit trail)

### Shadow Logs Table ("Black Box")
- Raw request/response from partner APIs
- Logged BEFORE processing → ensures we have proof
- Used when partner says "we never received that"

### Verification Tasks Table
- Manual reconciliation queue
- Tracks zombies: money left bank but didn't update app

### Circuit Breaker Events Table
- Fraud detection log
- Prevents same vendor payment twice in 10 minutes

## 🚀 Getting Started

### Prerequisites
- PostgreSQL 14+
- Node.js 18+

### Setup

```bash
# 1. Clone and install
git clone <repo>
cd payments-infra-agents
npm install

# 2. Create .env file
cp .env.example .env
# Edit .env with your database URL and partner API credentials

# 3. Run migrations
npm run migrate

# 4. Start development server
npm run dev
```

Server runs on `http://localhost:3000`

### Health Check
```bash
curl http://localhost:3000/health
```

## 📖 API Reference

### Create Transaction
```bash
POST /api/transactions
Content-Type: application/json

{
  "reference_id": "ORDER-123",
  "account_id": "<uuid>",
  "merchant_id": "<uuid>",
  "amount_cents": 10000,
  "currency": "SGD"
}

Response (201):
{
  "success": true,
  "data": {
    "id": "<uuid>",
    "reference_id": "ORDER-123",
    "status": "pending",
    "requires_approval": false,
    "amount_cents": 10000,
    "created_at": "2026-05-02T10:00:00Z"
  }
}
```

### Get Pending Approvals
```bash
GET /api/transactions

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "<uuid>",
      "status": "requires_approval",
      "amount_cents": 60000,
      "requires_approval": true,
      ...
    }
  ]
}
```

### Get Transaction with Audit Trail
```bash
GET /api/transactions/{id}

Response (200):
{
  "success": true,
  "data": {
    "transaction": { ... },
    "shadowLogs": [
      {
        "id": "<uuid>",
        "partner_name": "UOB",
        "endpoint": "/api/v1/transfers",
        "request_payload": { ... },
        "response_payload": { ... },
        "response_status_code": 200,
        "created_at": "2026-05-02T10:00:00Z"
      }
    ]
  }
}
```

### Approve Transaction
```bash
POST /api/transactions/{id}/approve
Content-Type: application/json

{
  "user_id": "<uuid>"
}

Response (200):
{
  "success": true,
  "data": {
    "id": "<uuid>",
    "status": "approved",
    "approved_by_user_id": "<uuid>",
    "approval_timestamp": "2026-05-02T10:00:00Z",
    ...
  }
}
```

### Reject Transaction
```bash
POST /api/transactions/{id}/reject
Content-Type: application/json

{
  "reason": "Insufficient funds"
}

Response (200):
{
  "success": true,
  "data": {
    "id": "<uuid>",
    "status": "rejected",
    "rejection_reason": "Insufficient funds",
    ...
  }
}
```

## 🔍 Key Workflows

### Workflow 1: Transaction Under Threshold ($100)
```
1. POST /api/transactions with amount_cents=10000
2. Service checks: 10000 < 50000? Yes
3. Transaction created with status="pending"
4. Ready to process immediately
```

### Workflow 2: Transaction Over Threshold ($600)
```
1. POST /api/transactions with amount_cents=60000
2. Service checks: 60000 >= 50000? Yes
3. Transaction created with status="requires_approval"
4. Listed in GET /api/transactions (approval queue)
5. Human reviews and calls POST /api/transactions/{id}/approve
6. Recorded who approved and when
```

### Workflow 3: Partner API Call
```
1. Service calls partnerApiAdapter.call()
2. Request logged to shadow_logs FIRST
3. API call made to partner bank
4. Response logged to shadow_logs
5. If error: Error also logged
6. This creates proof of attempt (prevents disputes)
```

### Workflow 4: Duplicate Payment Detection
```
1. Mandate tries to pay vendor_id twice in 10 minutes
2. circuitBreakerService.canProceed(vendor_id) returns false
3. Circuit breaker opened, transaction blocked
4. Event logged for manual investigation
5. Support team can resolve manually
```

## 🛠️ Development

### Project Structure
```
src/
  types.ts              # Domain types & Zod schemas (START HERE)
  index.ts              # Server entry point
  api/
    app.ts              # Express setup
    routes/             # API endpoints
    middleware/         # Error handling, logging
  db/
    connection.ts       # Database utilities
    repositories/       # Data access layer
  services/             # Business logic
tests/                  # Test suite
migrations/             # Database migrations
```

### Adding a Feature

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed guide on adding features while maintaining the structure for AI agent development.

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
npm start
```

## 📝 Logs

All logs are structured JSON for easy parsing:

```json
{
  "level": "INFO",
  "timestamp": "2026-05-02T10:00:00Z",
  "message": "Transaction created",
  "transactionId": "<uuid>",
  "amount": 10000
}
```

Export to your logging system (Datadog, CloudWatch, etc.) for visibility.

## 🔐 Security Notes

- All transactions > $500 require manual approval (regulatory compliance)
- Partner API responses validated before processing
- All changes logged with timestamps and user IDs (audit trail)
- Circuit breaker prevents obvious fraud
- Shadow logs provide dispute evidence

**Not secure for:** Production without additional audit logging, PCI compliance work, and security review.

## 📊 Metrics to Track

- Transaction creation rate
- Approval queue length
- Average time to manual approval
- Partner API error rate
- Zombie transaction rate (money left bank, didn't update app)
- Circuit breaker triggers (fraud attempts?)

## 🚨 Common Issues

### "Transaction stuck in pending"
→ Check `sqlite> SELECT * FROM transactions WHERE status='pending'`
→ Likely waiting in approval queue (amount > threshold)

### "Partner API call failed"
→ Check `SELECT * FROM shadow_logs WHERE error_message IS NOT NULL`
→ See raw request/response to debug

### "Balance doesn't match bank"
→ This is what `verification_tasks` table is for (Phase 2)
→ Track zombies: money left bank but didn't update app

## 🗺️ Roadmap

| Phase | Focus | Estimate |
| --- | --- | --- |
| **Phase 1** (NOW) | The Plumbing | 4 weeks |
| **Phase 2** | Reconciliation (CSV parser) | 4 weeks |
| **Phase 3** | Mandates (spending controls) | 4 weeks |
| **Phase 4** | Multi-bank (when first throttles) | TBD |

## 📞 Support

For AI agent development:
1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) - How the code is organized
2. Read [DEVELOPMENT.md](./DEVELOPMENT.md) - How to add features
3. Look at existing patterns in `src/` - Follow the same structure

For product questions:
- See [product.md](./product.md) - Full strategy & rationale