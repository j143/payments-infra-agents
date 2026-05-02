# Directory Structure Reference

```
payments-infra-agents/
├── src/                                    # Source code
│   ├── types.ts                           # ← Domain types & Zod schemas (START HERE)
│   ├── index.ts                           # Server entry point
│   │
│   ├── api/                               # HTTP API layer
│   │   ├── app.ts                         # Express app setup
│   │   ├── routes/
│   │   │   ├── transactions.ts            # Transaction endpoints
│   │   │   ├── circuit-breaker.ts        # Circuit breaker endpoints
│   │   │   └── verification-tasks.ts     # Reconciliation endpoints
│   │   └── middleware/
│   │       ├── error-handler.ts          # Centralized error handling
│   │       ├── logger.ts                 # Structured logging utilities
│   │       └── request-logger.ts         # Request/response logging
│   │
│   ├── db/                                # Database layer
│   │   ├── connection.ts                 # DB connection & utilities
│   │   └── repositories/                 # Data access (one per entity)
│   │       ├── transaction.repository.ts
│   │       ├── shadow-log.repository.ts
│   │       ├── verification-task.repository.ts
│   │       └── account.repository.ts
│   │
│   └── services/                          # Business logic layer
│       ├── transaction.service.ts        # Transaction workflows
│       ├── partner-api.adapter.ts        # Partner API integration
│       ├── circuit-breaker.service.ts    # Fraud detection
│       └── verification-task.service.ts  # Reconciliation logic
│
├── migrations/                            # Database schema
│   ├── 001_initial_schema.ts             # Schema definition
│   └── run.ts                            # Migration runner
│
├── tests/                                 # Test suite
│   ├── setup.ts                          # Test utilities
│   └── db/repositories/
│       └── transaction.repository.test.ts # Example tests
│
├── .env.example                           # Environment template
├── .gitignore                             # Git ignore rules
├── package.json                           # Dependencies
├── tsconfig.json                          # TypeScript config
├── vitest.config.ts                      # Test runner config
│
└── Documentation/
    ├── README.md                          # Overview & API reference
    ├── ARCHITECTURE.md                    # Codebase structure for AI agents
    ├── DEVELOPMENT.md                     # Feature development guide
    ├── AI_AGENT_QUICK_REFERENCE.md       # Quick cheat sheet
    ├── DIRECTORY_STRUCTURE.md            # This file
    └── product.md                         # Product strategy & rationale
```

## 📍 Where to Find Things

### "I want to understand the project"
1. `README.md` - Overview
2. `product.md` - Why we built it this way

### "I want to understand the code structure"
1. `ARCHITECTURE.md` - How code is organized
2. `src/types.ts` - All domain types

### "I want to add a feature"
1. `DEVELOPMENT.md` - Step-by-step guide
2. `AI_AGENT_QUICK_REFERENCE.md` - Common patterns

### "I want to debug something"
1. Look for similar code in `src/`
2. Check `tests/` for examples
3. Read error logs from `shadow_logs` table
4. Check `DEVELOPMENT.md` debugging section

### "I want to understand transactions"
1. Type: `src/types.ts` → `TransactionSchema`
2. Repository: `src/db/repositories/transaction.repository.ts`
3. Service: `src/services/transaction.service.ts`
4. Routes: `src/api/routes/transactions.ts`

### "I want to understand partner API calls"
1. Service: `src/services/partner-api.adapter.ts`
2. Shadow logs: `src/db/repositories/shadow-log.repository.ts`
3. Schema: `src/types.ts` → `ShadowLogSchema`

### "I want to write tests"
1. Setup: `tests/setup.ts`
2. Example: `tests/db/repositories/transaction.repository.test.ts`
3. Config: `vitest.config.ts`

## 🎯 Key Files

### Must Read
- `src/types.ts` - All types, schemas, error codes
- `ARCHITECTURE.md` - How to organize code
- `AI_AGENT_QUICK_REFERENCE.md` - Common operations

### Core Features
- `src/services/transaction.service.ts` - Human approval workflow
- `src/services/partner-api.adapter.ts` - Shadow logging pattern
- `src/services/circuit-breaker.service.ts` - Fraud detection

### Data Access
- `src/db/repositories/transaction.repository.ts` - Example repository
- `src/db/repositories/shadow-log.repository.ts` - Detailed logging
- `src/db/repositories/verification-task.repository.ts` - Reconciliation queue

### API Endpoints
- `src/api/routes/transactions.ts` - Transaction CRUD
- `src/api/routes/circuit-breaker.ts` - Fraud detection status
- `src/api/routes/verification-tasks.ts` - Reconciliation queue

## 📋 File Sizes (Guideline)

- **Types** (`src/types.ts`) - ~200 lines
  - All domain models with Zod
  - All error codes
  - Interfaces for services

- **Repository** (each) - ~150-200 lines
  - CRUD operations
  - Specific queries
  - Row-to-type conversion

- **Service** (each) - ~100-150 lines
  - Business logic
  - Orchestration
  - Error handling

- **Route** (each) - ~100-150 lines
  - Endpoint definitions
  - Request validation
  - Response formatting

## 🏗️ Adding a New Feature

1. Add types to `src/types.ts`
2. Create `src/db/repositories/feature.repository.ts`
3. Create `src/services/feature.service.ts`
4. Create `src/api/routes/features.ts`
5. Register routes in `src/api/app.ts`
6. Add tests in `tests/`

## ✅ Pattern Consistency

All layers follow the same patterns:

**Repository Pattern:**
```typescript
export const repo = {
  async create(req): Promise<Type> { }
  async findById(id): Promise<Type | null> { }
  async findAll(): Promise<Type[]> { }
  async update(id, changes): Promise<Type | null> { }
  async delete(id): Promise<boolean> { }
};
```

**Service Pattern:**
```typescript
export const service = {
  async doSomething(input): Promise<Output> {
    // 1. Validate
    const data = await repo.find(input.id);
    if (!data) throw new ApplicationError(...);
    
    // 2. Process
    const result = transform(data);
    
    // 3. Update & log
    logger.log("Done", { result });
    return result;
  }
};
```

**Route Pattern:**
```typescript
router.post("/endpoint", async (req, res, next) => {
  try {
    const validated = Schema.parse(req.body);
    const result = await service.doSomething(validated);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
```

## 🔄 Request Flow

```
Client HTTP Request
    ↓
[Request Logger Middleware]
    ↓
[Route Handler - Validate Input with Zod]
    ↓
[Service - Business Logic]
    ↓
[Repository - Database Access]
    ↓
[PostgreSQL - Persistence]
    ↓
[Response - JSON Response]
    ↓
[Error Handler - If error occurs at any step]
```

## 🗝️ Key Concepts

### Three-Layer Architecture
- **Routes** - HTTP request/response
- **Services** - Business logic
- **Repositories** - Database queries

### Type Safety
- Zod validates all inputs at route level
- TypeScript catches type errors at compile time
- Runtime validation catches edge cases

### Error Handling
- All errors are `ApplicationError` with specific `ErrorCode`
- Error handler middleware returns consistent JSON
- Each layer adds context about what failed

### Logging
- Structured JSON logging for all operations
- Request/response logging for debugging
- Shadow logs for audit trails

### Audit Trail
- Shadow logs capture all partner API calls
- All transactions logged with timestamps
- User IDs recorded for all approvals
- Full state history in `updated_at` fields
