/**
 * AI Agent Quick Reference
 * 
 * This is a cheat sheet for the most common operations.
 */

# 🚀 AI Agent Quick Reference

## Common Commands

```bash
# Install dependencies
npm install

# Run migrations (creates database)
npm run migrate

# Start development server
npm run dev

# Run all tests
npm test

# Build for production
npm run build
```

## Common Imports

```typescript
// Types
import { Transaction, ApplicationError, ErrorCode } from "../src/types";

// Repositories
import { transactionRepository } from "../src/db/repositories/transaction.repository";
import { shadowLogRepository } from "../src/db/repositories/shadow-log.repository";

// Services
import { transactionService } from "../src/services/transaction.service";
import { partnerApiAdapter } from "../src/services/partner-api.adapter";
import { circuitBreakerService } from "../src/services/circuit-breaker.service";

// Utilities
import { logger } from "../src/api/middleware/logger";
import { sql } from "../src/db/connection";
```

## Common Patterns

### 1. Create Something
```typescript
const newTransaction = await transactionRepository.create({
  reference_id: "REF-123",
  account_id: "acc-123",
  merchant_id: "mer-123",
  amount_cents: 10000,
  currency: "SGD",
});
```

### 2. Find Something
```typescript
const transaction = await transactionRepository.findById("tx-123");
if (!transaction) {
  throw new ApplicationError(
    ErrorCode.TRANSACTION_NOT_FOUND,
    "Transaction not found",
    404
  );
}
```

### 3. Update Something
```typescript
const updated = await transactionRepository.updateStatus(
  "tx-123",
  "approved",
  { approved_by_user_id: "user-123" }
);
```

### 4. Handle Errors
```typescript
try {
  // Do something
} catch (error) {
  if (error instanceof ApplicationError) {
    throw error; // Already handled
  }
  throw new ApplicationError(
    ErrorCode.INTERNAL_ERROR,
    `Operation failed: ${error instanceof Error ? error.message : "unknown"}`,
    500
  );
}
```

### 5. Log Something
```typescript
logger.log("Transaction processing", {
  transactionId: "tx-123",
  status: "approved",
  amount: 10000,
});

logger.error("Transaction failed", {
  transactionId: "tx-123",
  reason: "Partner API timeout",
});
```

### 6. Call Partner API
```typescript
const response = await partnerApiAdapter.call({
  transactionId: "tx-123",
  partnerName: "UOB",
  endpoint: "/api/v1/transfers",
  method: "POST",
  requestPayload: {
    to_account: "ACC-456",
    amount: 10000,
  },
});

// Response is: { status: 200, payload: {...} }
```

### 7. Write a Route
```typescript
router.post("/transactions", async (req, res, next) => {
  try {
    const validated = CreateTransactionRequestSchema.parse(req.body);
    const result = await transactionService.createTransaction(validated);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
```

### 8. Write a Service
```typescript
export const myService = {
  async doSomething(input: InputType): Promise<OutputType> {
    logger.log("Starting operation", { input });
    
    try {
      const data = await myRepository.find(input.id);
      if (!data) {
        throw new ApplicationError(ErrorCode.NOT_FOUND, "Not found", 404);
      }
      
      const result = await myRepository.update(data.id, { status: "done" });
      logger.log("Operation complete", { id: result.id });
      return result;
    } catch (error) {
      logger.error("Operation failed", { error, input });
      throw error;
    }
  },
};
```

### 9. Write a Test
```typescript
describe("myRepository", () => {
  setupTestDatabase();

  it("should create item", async () => {
    const item = await myRepository.create({ name: "test" });
    expect(item.name).toBe("test");
  });

  it("should throw on duplicate", async () => {
    await myRepository.create({ name: "test" });
    
    try {
      await myRepository.create({ name: "test" });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
    }
  });
});
```

## Key Constants

```typescript
// Approval threshold (cents)
const HUMAN_APPROVAL_THRESHOLD_CENTS = 50000; // $500

// Circuit breaker window (minutes)
const CIRCUIT_BREAKER_WINDOW_MINUTES = 10;
```

## Error Codes

```typescript
ErrorCode.INVALID_INPUT
ErrorCode.VALIDATION_FAILED
ErrorCode.TRANSACTION_NOT_FOUND
ErrorCode.DUPLICATE_TRANSACTION
ErrorCode.INSUFFICIENT_FUNDS
ErrorCode.PARTNER_API_ERROR
ErrorCode.PARTNER_API_TIMEOUT
ErrorCode.CIRCUIT_BREAKER_OPEN
ErrorCode.DATABASE_ERROR
ErrorCode.INTERNAL_ERROR
```

## Transaction Status Flow

```
pending → requires_approval → approved → processing → completed
                           ↘ rejected
                           ↘ failed
```

## File Structure When Adding a Feature

1. **Add types** to `src/types.ts`
2. **Add repository** to `src/db/repositories/feature.repository.ts`
3. **Add service** to `src/services/feature.service.ts`
4. **Add routes** to `src/api/routes/features.ts`
5. **Register routes** in `src/api/app.ts`
6. **Add tests** to `tests/` (mirror the structure)

## Useful SQL Patterns

```typescript
// Get with filtering
const txs = await sql`
  SELECT * FROM transactions 
  WHERE status = 'pending' 
  ORDER BY created_at DESC
  LIMIT ${limit}
`;

// Update with conditional
const result = await sql`
  UPDATE transactions 
  SET status = 'approved'
  WHERE id = ${id} AND status = 'requires_approval'
  RETURNING *
`;

// Transaction (multi-statement)
await db.transaction(async (tx) => {
  await tx`UPDATE accounts SET balance = balance - 10000 WHERE id = ${id}`;
  await tx`INSERT INTO transactions ...`;
});
```

## Debugging

```typescript
// Print something
console.log("Debug:", JSON.stringify(data, null, 2));

// Check what's in database
const all = await sql`SELECT * FROM transactions`;
console.log(all);

// Check errors
const errors = await shadowLogRepository.findErrors(10);
console.log("Recent errors:", errors);

// Enable debug logs
process.env.LOG_LEVEL = "debug";
logger.debug("Detailed trace", { data });
```

## Common Mistakes to Avoid

❌ Throwing plain Error
```typescript
throw new Error("Something failed");
```
✅ Throw ApplicationError
```typescript
throw new ApplicationError(ErrorCode.DATABASE_ERROR, "Something failed", 500);
```

❌ Unvalidated input
```typescript
const tx = req.body as Transaction;
```
✅ Validated with Zod
```typescript
const tx = TransactionSchema.parse(req.body);
```

❌ Complex logic in repository
```typescript
// In repository - avoid!
if (amount > 50000) { /* complex logic */ }
```
✅ Keep logic in service
```typescript
// In service - correct!
if (amount > threshold) { }
```

❌ Loose logging
```typescript
logger.log("Transaction: " + tx.id);
```
✅ Structured logging
```typescript
logger.log("Transaction created", { id: tx.id, amount: tx.amount_cents });
```

## When Stuck

1. **"How do I X?"** → Look at similar code in `src/`
2. **"What's the error?"** → Check shadow_logs table
3. **"Test is failing?"** → Check test setup, run in isolation
4. **"Type error?"** → Check `src/types.ts` for correct schema
5. **"Need an example?"** → See `tests/db/repositories/transaction.repository.test.ts`
