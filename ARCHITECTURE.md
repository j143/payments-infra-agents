# Payments Infra - Codebase Structure for AI Agents

## 📋 Quick Navigation

This codebase is organized to be easily understood and modified by AI agents. Here's where to find things:

### Core Structure

```
src/
├── types.ts                  # ← START HERE: All domain types & schemas
├── index.ts                  # Server entry point
├── api/
│   ├── app.ts               # Express app setup
│   ├── routes/              # API endpoints (organized by feature)
│   └── middleware/          # Middleware (error handling, logging)
├── db/
│   ├── connection.ts        # Database connection & utilities
│   └── repositories/        # Data access layer (one per entity)
└── services/                # Business logic layer
```

## 🎯 Key Principles

### 1. **Type Safety First**
All data structures are defined in `src/types.ts` using Zod. When adding a feature:
1. Add the types to `src/types.ts`
2. Import them in repositories/services
3. Use Zod validation in routes

**Why?** AI agents need clear contracts to work with. Zod ensures runtime validation.

### 2. **Three-Layer Architecture**
- **Routes** (`src/api/routes/`) - Request handling & validation
- **Services** (`src/services/`) - Business logic & orchestration
- **Repositories** (`src/db/repositories/`) - Database access

**Why?** Each layer has a single responsibility. Easy to test & modify.

### 3. **Error Handling is Explicit**
Always throw `ApplicationError` with an `ErrorCode`:
```typescript
throw new ApplicationError(
  ErrorCode.TRANSACTION_NOT_FOUND,
  "Transaction 123 not found",
  404
);
```

**Why?** Consistent error handling makes debugging easier for AI agents.

### 4. **Logging is Everywhere**
Use the structured logger:
```typescript
import { logger } from "./api/middleware/logger";
logger.log("Transaction created", { transactionId: "123", amount: 50000 });
```

## 🛠️ How to Add a New Feature

### Example: Add a "Reconciliation" Feature

#### Step 1: Define Types in `src/types.ts`
```typescript
export const ReconciliationReportSchema = z.object({
  id: z.string().uuid(),
  bank_csv_rows: z.number(),
  app_records: z.number(),
  matched: z.number(),
  unmatched_zombies: z.number(),
  created_at: z.date(),
});
export type ReconciliationReport = z.infer<typeof ReconciliationReportSchema>;
```

#### Step 2: Create Repository in `src/db/repositories/reconciliation.repository.ts`
```typescript
export const reconciliationRepository = {
  async create(report: CreateReconciliationRequest): Promise<ReconciliationReport> {
    // SQL query here
  },
  
  async findLatest(): Promise<ReconciliationReport | null> {
    // SQL query here
  },
};
```

#### Step 3: Create Service in `src/services/reconciliation.service.ts`
```typescript
export const reconciliationService = {
  async runReconciliation(): Promise<ReconciliationReport> {
    // Business logic here
    // Call repositories as needed
  },
};
```

#### Step 4: Create Routes in `src/api/routes/reconciliation.ts`
```typescript
router.post("/reconciliations/run", async (req, res, next) => {
  try {
    const report = await reconciliationService.runReconciliation();
    res.status(201).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});
```

#### Step 5: Register Routes in `src/api/app.ts`
```typescript
import { reconciliationRoutes } from "./routes/reconciliation";
app.use("/api", reconciliationRoutes);
```

## 🗂️ Existing Patterns

### Transaction Flow
1. User calls `POST /api/transactions`
2. Request validated by `CreateTransactionRequestSchema`
3. `transactionService.createTransaction()` is called
4. If amount >= $500 threshold → marked for approval
5. All changes logged to `shadow_logs` table

### Partner API Integration
1. Call `partnerApiAdapter.call()` with transaction ID
2. Request logged to `shadow_logs` BEFORE making the call
3. Response logged AFTER receiving it
4. This creates an audit trail for disputes

### Human Approval
1. Transactions >= $500 are marked `requires_approval`
2. Listed at `GET /api/transactions`
3. Approved via `POST /api/transactions/{id}/approve`
4. User ID and timestamp recorded in DB

## 📖 Repository Interface Pattern

All repositories follow this pattern:

```typescript
export const myRepository = {
  async create(req: CreateRequest): Promise<Entity> { },
  async findById(id: string): Promise<Entity | null> { },
  async findAll(): Promise<Entity[]> { },
  async update(id: string, changes: Partial<Entity>): Promise<Entity | null> { },
  async delete(id: string): Promise<boolean> { },
};
```

When adding a repository:
- Use `sql\`\`` template literals (not string concatenation)
- Always handle NULL explicitly
- Convert DB rows to TypeScript types
- Throw `ApplicationError` on failure

## 📝 API Request/Response Pattern

All routes follow this pattern:

```typescript
router.post("/endpoint", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Validate input
    const validated = SomeSchema.parse(req.body);
    
    // 2. Call service
    const result = await someService.doSomething(validated);
    
    // 3. Return success response
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    // 4. Let errorHandler middleware deal with it
    next(error);
  }
});
```

## 🔍 Finding Things

### Q: "How do I create a transaction?"
A: Look at `src/db/repositories/transaction.repository.ts` (the CREATE operation)

### Q: "What determines if a transaction needs approval?"
A: Look at `src/services/transaction.service.ts` (the `createTransaction` function checks threshold)

### Q: "What happens when we call a partner API?"
A: Look at `src/services/partner-api.adapter.ts` (see `call` method)

### Q: "What are all the error codes?"
A: Look at `src/types.ts` (the `ErrorCode` enum)

## 🚀 Running the Code

```bash
# Install dependencies
npm install

# Run migrations (creates database schema)
npm run migrate

# Start development server
npm run dev

# Build for production
npm build

# Run tests
npm test
```

## 📊 Database Schema

The schema is in `migrations/001_initial_schema.ts`. Key tables:

- **transactions** - Core ledger
- **shadow_logs** - Partner API call audit trail
- **verification_tasks** - Manual reconciliation queue
- **circuit_breaker_events** - Fraud detection
- **accounts** - Merchant accounts

All tables have `created_at` and `updated_at` timestamps for audit trails.

## 🔒 Configuration

Environment variables in `.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `API_PORT` - Port to run server on
- `HUMAN_APPROVAL_THRESHOLD` - Amount in cents requiring approval (default: 50000 = $500)
- `PARTNER_API_URL` - Partner bank API base URL
- `PARTNER_API_KEY` - Authentication key

## 💡 Best Practices for AI Agents

1. **Always check null/undefined** - Databases return null, TypeScript enforces it
2. **Use Zod for all input validation** - Don't trust req.body
3. **Type your errors** - Use ApplicationError with ErrorCode
4. **Log structured data** - Pass objects to logger, not strings
5. **Keep repositories database-focused** - Business logic goes in services
6. **Keep services transaction-aware** - Use `db.transaction()` for multi-step operations
7. **Test error paths** - Happy path is easy; error handling is critical
