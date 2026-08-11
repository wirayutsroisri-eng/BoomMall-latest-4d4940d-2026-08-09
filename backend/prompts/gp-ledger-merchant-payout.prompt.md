# PROMPT: BoomMall Marketplace GP Ledger & Merchant Payout (Backend)

Owner: #CTO + #BACKEND (+ #ARCHITECT review)  
Priority: Financial correctness > feature speed  
Stack: Express 5 + Prisma 6 + PostgreSQL (extend existing `backend/`)  
App Store: Do NOT enable iOS buyer checkout / real THB payment UI until PSP + IAP policy are cleared. Backend may still implement ledger + settlement APIs for admin/ops and future release.

---

## 0. Context (do not reinvent)

BoomMall already has a **Boom Coin closed-loop double-entry ledger**:

- Prisma: `Wallet`, `WalletAccount` (AVAILABLE|PENDING|LOCKED), `WalletTransaction`, `LedgerEntry`
- Service: `backend/src/services/ledger.ts` (mint path today)
- Rule: **never mutate balances without balanced ledger entries**; balances are projections only

**Gap:** There is NO marketplace order money pipeline, NO platform take-rate (GP %), NO merchant earnings settlement, NO THB payout batch.  
Client `captureLockToMerchant` credits merchant 100% (preview only). Handbook “Seller GP” means seller ops spend of Coin — NOT marketplace commission.

---

## 1. Business rules (must encode in DB + services)

### 1.1 GP (Gross Profit / Platform take-rate)

On each **settled order line** (or order-level if configured), calculate:

- `gmv` = merchandise subtotal after item discounts (exclude shipping unless policy says include)
- `platformFee` = round(`gmv * gpRateBps / 10000`) using **banker's rounding or half-up — pick one and document**
- `merchantNet` = `gmv - platformFee` (before shipping pass-through if any)

`gpRateBps` is integer basis points (e.g. 1000 = 10.00%). Store per shop category / seller tier / campaign override with effective dating.

**Every GP deduction MUST create immutable ledger postings** (see §2). No silent balance edits.

### 1.2 Timing

- `CAPTURED` payment → credit merchant `PENDING` (hold)
- After `holdDays` (default 7) OR status `DELIVERED`+`buyerConfirm` → release `PENDING` → `AVAILABLE`
- Refund / chargeback → reverse fee + net with linked `REVERSAL` transaction (idempotent)

### 1.3 Merchant payout (THB settlement outbound)

- Separate from Boom Coin mint/top-up.
- Merchant requests payout from `AVAILABLE` earnings (prefer **satang BigInt** for THB; document unit).
- Batch: `PayoutBatch` → bank transfer file / PSP payout API stub with status machine:  
  `REQUESTED → APPROVED → PROCESSING → PAID | FAILED | CANCELLED`
- Soft Ban / Hard Delete users: freeze payouts (align moderation quarantine).

### 1.4 Audit

- Every admin/finance action logs `actorId`, `reason`, `before/after`, timestamp
- Ledger rows immutable after COMMITTED; corrections only via compensating entries

---

## 2. Double-entry posting patterns (implement exactly)

Use existing `WalletTransaction` + `LedgerEntry` (extend `TxType` enum). For each committed tx: `sum(DEBIT) == sum(CREDIT)`.

Suggested new `TxType` values:

- `ORDER_CAPTURE` — buyer paid → split to merchant PENDING + platform fee
- `ORDER_RELEASE` — PENDING → AVAILABLE
- `ORDER_REFUND` / `ORDER_REVERSAL`
- `GP_FEE` (optional if fee is separate header; otherwise embed in ORDER_CAPTURE metadata)
- `MERCHANT_PAYOUT` — AVAILABLE → external clearing / treasury transit
- `PAYOUT_RETURN` — failed payout return

Example `ORDER_CAPTURE`:

1. DEBIT buyer LOCKED (or PAYMENT_CLEARING)
2. CREDIT merchant PENDING = `merchantNet`
3. CREDIT PLATFORM_TREASURY AVAILABLE = `platformFee`

Idempotency: `idempotencyKey` unique per `(orderId, eventType, attempt)`.

---

## 3. Prisma models to add (names may be adjusted but fields required)

```
CommissionPolicy { id, scope (GLOBAL|CATEGORY|SELLER), scopeRef?, gpRateBps Int, effectiveFrom, effectiveTo?, priority Int, active Boolean }
Order { id, buyerRef, sellerRef, shopId, currency, status, gmv, platformFee, merchantNet, gpRateBps, capturedAt?, … }
OrderLine { id, orderId, productId, qty, unitPrice, lineGmv, lineFee, lineNet }
MerchantEarning { id, sellerRef, orderId, amount, bucket PENDING|AVAILABLE|PAID|REVERSED, holdUntil?, ledgerTxId? }
PayoutAccount { id, sellerRef, bankCode, accountNumberMasked, accountName, verifiedAt? }
PayoutRequest { id, sellerRef, amount, status, batchId?, ledgerTxId?, requestedAt, processedAt? }
PayoutBatch { id, status, totalAmount, itemCount, createdBy, exportUri? }
FinanceAuditLog { id, actor, action, entityType, entityId, detail Json, createdAt }
```

Extend enums in `schema.prisma` carefully with migration. Keep Boom Coin mint models intact.

---

## 4. API endpoints (version under `/api/v1`)

**Admin** (`requireAdmin`):

- `GET  /admin/finance/stats` — GMV, GP collected, pending payouts, failed payouts
- `GET  /admin/finance/orders?status=`
- `POST /admin/finance/orders/:id/capture` — apply GP split + ledger (idempotent)
- `POST /admin/finance/orders/:id/release` — PENDING→AVAILABLE
- `POST /admin/finance/orders/:id/refund` — compensating entries
- `GET  /admin/finance/ledger?orderId=|&sellerRef=`
- `GET|POST /admin/finance/commission-policies`
- `GET  /admin/finance/payouts`
- `POST /admin/finance/payouts/:id/approve | reject`
- `POST /admin/finance/payout-batches` — create + mark PROCESSING
- `POST /admin/finance/payout-batches/:id/mark-paid`

**Seller / internal** (auth later):

- `GET  /sellers/me/earnings`
- `POST /sellers/me/payouts` `{ amount, payoutAccountId }`

Public mobile checkout hooks may stay stubbed behind feature flags.

---

## 5. Services (modular TypeScript)

- `services/commission.ts` — resolve `gpRateBps` + compute fee/net
- `services/orderFinance.ts` — capture / release / refund orchestration
- `services/merchantEarnings.ts` — bucket projections (must match ledger)
- `services/payout.ts` — request / approve / batch / mark-paid
- Extend `services/ledger.ts` — generic `postDoubleEntry({ type, lines, metadata, idempotencyKey })`

---

## 6. Invariants & tests (must ship)

1. For every COMMITTED `WalletTransaction`: Σ debit = Σ credit
2. `merchantNet + platformFee = gmv` (per order) within 0–1 minor unit; document remainder policy
3. Replaying same `idempotencyKey` returns same result, no double fee
4. Refund after release posts reversals; AVAILABLE never goes negative
5. Payout amount ≤ AVAILABLE; concurrent payouts serialized (row version / `SELECT FOR UPDATE`)
6. Reconcile job: sum(`MerchantEarning` AVAILABLE) == wallet projection for seller earnings account

---

## 7. Admin UI (minimal)

Extend `admin/` with Finance page: stats widgets, order capture actions, payout queue — mirror ModerationPage one-screen ops style.

---

## 8. Out of scope (explicit)

- Real PromptPay/card PSP charge (stub PaymentIntent status only)
- iOS in-app purchase of Boom Coin / digital goods
- Changing App Store gates on mobile checkout
- Guest checkout

---

## 9. Deliverables checklist

- [ ] Prisma migration + enums
- [ ] Ledger `postDoubleEntry` + `ORDER_*` tx types
- [ ] Commission policy resolver
- [ ] Capture / release / refund APIs
- [ ] Payout request + batch APIs
- [ ] `FinanceAuditLog` on admin actions
- [ ] Unit tests for fee math + double-entry + idempotency
- [ ] Admin Finance page (read + 1-click capture/approve)
- [ ] Short README in `backend/docs/gp-ledger.md` explaining posting matrix

Implement clean, modular TypeScript. Prefer extending existing ledger over a second parallel money system.
