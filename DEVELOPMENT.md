# Development Guidelines for AI Agents

## 🎯 Pre-Development Checklist

Before making changes, AI agents should:

1. ✅ Read `ARCHITECTURE.md` to understand the codebase structure
2. ✅ Identify which layer(s) need changes (routes, services, repositories)
3. ✅ Check if the domain types exist in `src/types.ts`
4. ✅ Look for similar existing patterns to follow

## 📝 Code Review Checklist

After writing code, verify:

- [ ] **Types**: All data structures use Zod schemas defined in `src/types.ts`
- [ ] **Errors**: All errors throw `ApplicationError` with appropriate `ErrorCode`
- [ ] **Logging**: Structured logging with `logger.log/debug/warn/error`
- [ ] **Database**: Repositories use `sql\`\`` literals, handle nulls, convert rows
- [ ] **Services**: Business logic only, call repositories as needed
- [ ] **Routes**: Validate input with Zod, call services, return consistent JSON
- [ ] **Tests**: The feature has test coverage (see `tests/` for examples)

## 🧪 Testing Patterns

### Unit Test Example (Repository)

```typescript
// tests/db/repositories/transaction.repository.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { transactionRepository } from "../../../src/db/repositories/transaction.repository";

describe("transactionRepository", () => {
  beforeEach(async () => {
    // Clear transactions table before each test
  });

  it("should create a transaction with pending status", async () => {
    const tx = await transactionRepository.create({
      reference_id: "REF-123",
      account_id: "acc-123",
      merchant_id: "mer-123",
      amount_cents: 10000,
      currency: "SGD",
    });

    expect(tx.status).toBe("pending");
    expect(tx.amount_cents).toBe(10000);
  });

  it("should throw on duplicate reference_id", async () => {
    await transactionRepository.create({ /* ... */ });
    
    expect(async () => {
      await transactionRepository.create({ reference_id: "same" });
    }).rejects.toThrow(ApplicationError);
  });
});
```

### Integration Test Example (Service)

```typescript
// tests/services/transaction.service.test.ts
describe("transactionService.createTransaction", () => {
  it("should mark for approval when amount >= threshold", async () => {
    const tx = await transactionService.createTransaction({
      reference_id: "REF-123",
      account_id: "acc-123",
      merchant_id: "mer-123",
      amount_cents: 60000,  // > $500 threshold
      currency: "SGD",
    });

    expect(tx.requires_approval).toBe(true);
    expect(tx.status).toBe("requires_approval");
  });
});
```

### API Test Example (Route)

```typescript
// tests/api/routes/transactions.test.ts
describe("POST /api/transactions", () => {
  it("should create and return transaction", async () => {
    const response = await request(app).post("/api/transactions").send({
      reference_id: "REF-123",
      account_id: "acc-123",
      merchant_id: "mer-123",
      amount_cents: 10000,
      currency: "SGD",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBeDefined();
  });

  it("should return 400 on invalid input", async () => {
    const response = await request(app).post("/api/transactions").send({
      amount_cents: -100,  // Invalid
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});
```

## 🔧 Common Tasks

### Add a New API Endpoint

1. **Create the route** in `src/api/routes/feature.ts`:
```typescript
router.post("/endpoint", async (req, res, next) => {
  try {
    const validated = YourSchema.parse(req.body);
    const result = await yourService.doSomething(validated);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
```

2. **Register the route** in `src/api/app.ts`:
```typescript
import { featureRoutes } from "./routes/feature";
app.use("/api", featureRoutes);
```

3. **Test it** in `tests/api/routes/feature.test.ts`

### Add a New Service

1. **Create the service** in `src/services/feature.service.ts`:
```typescript
export const featureService = {
  async doSomething(input: SomeType): Promise<ResultType> {
    // Use repositories here
    const data = await someRepository.findAll();
    // Transform data
    return data;
  },
};
```

2. **Use it in a route** or another service
3. **Test it** in `tests/services/feature.service.test.ts`

### Add a New Database Entity

1. **Create the migration** in `migrations/NNN_add_feature.ts`:
```typescript
export const schema = `
  CREATE TABLE IF NOT EXISTS features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;
```

2. **Add types** to `src/types.ts`:
```typescript
export const FeatureSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: z.date(),
});
export type Feature = z.infer<typeof FeatureSchema>;
```

3. **Create repository** in `src/db/repositories/feature.repository.ts`
4. **Create service** in `src/services/feature.service.ts`
5. **Create routes** in `src/api/routes/features.ts`

## 🐛 Debugging Tips

### Check Database State
```typescript
// In any service/repository
const debugQuery = await sql`SELECT * FROM transactions LIMIT 1`;
console.log("Debug:", debugQuery);
```

### View Shadow Logs (the "Black Box")
```typescript
// Check what happened with a partner API call
const logs = await shadowLogRepository.findByTransactionId(transactionId);
console.log("Partner API calls:", logs);
```

### Enable Debug Logging
```bash
# Set LOG_LEVEL=debug to see debug logs
LOG_LEVEL=debug npm run dev
```

## 📚 Real Examples in Codebase

- **Simple CRUD**: `src/db/repositories/transaction.repository.ts`
- **Business Logic with Threshold**: `src/services/transaction.service.ts`
- **External API Integration**: `src/services/partner-api.adapter.ts`
- **Error Handling**: `src/api/middleware/error-handler.ts`
- **Structured Logging**: `src/api/middleware/logger.ts`

## ⚠️ Common Mistakes

❌ **Mistake**: Throwing generic `Error` instead of `ApplicationError`
```typescript
throw new Error("Something failed");  // BAD
```
✅ **Fix**: Use ApplicationError with ErrorCode
```typescript
throw new ApplicationError(ErrorCode.DATABASE_ERROR, "Something failed", 500);
```

❌ **Mistake**: Logging unstructured data
```typescript
logger.log("Transaction: " + JSON.stringify(tx));  // BAD
```
✅ **Fix**: Use structured logging object
```typescript
logger.log("Transaction created", { id: tx.id, status: tx.status });
```

❌ **Mistake**: Skipping Zod validation
```typescript
const tx = req.body as Transaction;  // BAD - no validation!
```
✅ **Fix**: Always validate with Zod
```typescript
const tx = TransactionSchema.parse(req.body);
```

❌ **Mistake**: Complex logic in repositories
```typescript
// In repository - BAD!
if (amount > 50000) {
  // Do complex business logic
}
```
✅ **Fix**: Keep repositories simple, put logic in services
```typescript
// In repository - just CRUD
async create(req): Promise<Transaction> {
  return await sql`INSERT INTO ...`;
}

// In service - business logic
async createTransaction(req) {
  const tx = await repository.create(req);
  if (tx.amount_cents >= threshold) {
    await repository.markForApproval(tx.id);
  }
}
```

## 📞 Asking for Help

If unsure about something, look for similar patterns:

- **"How do I query the database?"** → See `src/db/repositories/` examples
- **"How do I handle errors?"** → See `src/types.ts` ErrorCode and any route
- **"How do I structure a service?"** → See `src/services/transaction.service.ts`
- **"How do I validate input?"** → See any route using Zod
- **"How do I add a new table?"** → See any migration file

The codebase is built to be consistent. When in doubt, follow the existing pattern.
