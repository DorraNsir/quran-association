-- «تعديل المعلوم» repricing and «نقل مالي» transfers between groups.
-- Additive: two NULLABLE columns, one new table, the one-live-obligation index
-- rebuilt with one more condition, and trigger functions replaced. No existing
-- row is updated, deleted or backfilled: every existing obligation keeps
-- closedAt = NULL and has no transfer, so all balances stay exactly the same.

-- ---------------------------------------------------------------------------
-- Obligations: closed by a transfer; a repriced obligation's replacement
-- ---------------------------------------------------------------------------
ALTER TABLE "payment_obligations" ADD COLUMN "closedAt" TIMESTAMPTZ(3),
ADD COLUMN "replacesObligationId" UUID;

CREATE UNIQUE INDEX "payment_obligations_replacesObligationId_key" ON "payment_obligations"("replacesObligationId");

ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_replacesObligationId_fkey" FOREIGN KEY ("replacesObligationId") REFERENCES "payment_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One LIVE obligation per student, group and academic year: voided AND closed
-- ones are history (a student back in a group after a transfer is billed again)
DROP INDEX "payment_obligations_one_live_key";
CREATE UNIQUE INDEX "payment_obligations_one_live_key" ON "payment_obligations"("studentId", "groupId", "academicYearId") WHERE ("voidedAt" IS NULL AND "closedAt" IS NULL);

-- ---------------------------------------------------------------------------
-- Transfers: immutable, at most one out of an obligation
-- ---------------------------------------------------------------------------
CREATE TABLE "obligation_transfers" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "fromObligationId" UUID NOT NULL,
    "toObligationId" UUID NOT NULL,
    "releasedAmount" DECIMAL(10,3) NOT NULL,
    "creditAmount" DECIMAL(10,3) NOT NULL,
    "excessAmount" DECIMAL(10,3) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obligation_transfers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "obligation_transfers_fromObligationId_key" ON "obligation_transfers"("fromObligationId");
CREATE INDEX "obligation_transfers_toObligationId_idx" ON "obligation_transfers"("toObligationId");
CREATE INDEX "obligation_transfers_studentId_idx" ON "obligation_transfers"("studentId");

ALTER TABLE "obligation_transfers" ADD CONSTRAINT "obligation_transfers_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "obligation_transfers" ADD CONSTRAINT "obligation_transfers_fromObligationId_fkey" FOREIGN KEY ("fromObligationId") REFERENCES "payment_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "obligation_transfers" ADD CONSTRAINT "obligation_transfers_toObligationId_fkey" FOREIGN KEY ("toObligationId") REFERENCES "payment_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "obligation_transfers" ADD CONSTRAINT "obligation_transfers_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "obligation_transfers" ADD CONSTRAINT "obligation_transfers_amounts_check"
  CHECK ("releasedAmount" >= 0 AND "creditAmount" >= 0 AND "excessAmount" >= 0);
ALTER TABLE "obligation_transfers" ADD CONSTRAINT "obligation_transfers_distinct_check"
  CHECK ("fromObligationId" <> "toObligationId");

-- Settled amount of an obligation = live cash payments + credit received − credit given
CREATE FUNCTION obligation_settled(obligation_id uuid) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT SUM(p."amount") FROM "payments" p
                   WHERE p."obligationId" = obligation_id AND p."voidedAt" IS NULL), 0)
       + COALESCE((SELECT SUM(t."creditAmount") FROM "obligation_transfers" t
                   WHERE t."toObligationId" = obligation_id), 0)
       - COALESCE((SELECT SUM(t."creditAmount") FROM "obligation_transfers" t
                   WHERE t."fromObligationId" = obligation_id), 0)
$$;

-- A transfer is written once, consistent with both obligations (locked here)
CREATE FUNCTION obligation_transfers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src record; dst record; settled numeric; room numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'obligation_transfers_immutable: a transfer cannot be rewritten'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'obligation_transfers_immutable';
  END IF;
  SELECT * INTO src FROM "payment_obligations" WHERE "id" = NEW."fromObligationId" FOR UPDATE;
  SELECT * INTO dst FROM "payment_obligations" WHERE "id" = NEW."toObligationId" FOR UPDATE;
  IF src."studentId" <> NEW."studentId" OR dst."studentId" <> NEW."studentId"
     OR src."academicYearId" <> dst."academicYearId" OR src."groupId" = dst."groupId"
     OR src."voidedAt" IS NOT NULL OR src."closedAt" IS NOT NULL
     OR dst."voidedAt" IS NOT NULL OR dst."closedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'obligation_transfers_invalid: both obligations must be live, of the same student and year, in two groups'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'obligation_transfers_invalid';
  END IF;
  -- Full replacement: the old obligation is released entirely
  settled := obligation_settled(src."id");
  room := dst."expectedAmount" - obligation_settled(dst."id");
  IF NEW."releasedAmount" <> src."expectedAmount"
     OR NEW."creditAmount" + NEW."excessAmount" <> settled
     OR NEW."creditAmount" > room THEN
    RAISE EXCEPTION 'obligation_transfers_amounts: released, credit and excess must match the obligations'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'obligation_transfers_amounts';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER obligation_transfers_guard BEFORE INSERT OR UPDATE ON "obligation_transfers"
  FOR EACH ROW EXECUTE FUNCTION obligation_transfers_guard();

-- ---------------------------------------------------------------------------
-- Obligations: frozen amount (unchanged), plus: a replacement points to a
-- voided obligation of the same student/group/year; closing happens once,
-- through a transfer; a closed obligation or one that received credit is
-- never voided (the credit would vanish)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION payment_obligations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fee_total numeric; replaced record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT f."amount" * f."numberOfPeriods" INTO fee_total
      FROM "group_fees" f WHERE f."id" = NEW."groupFeeId";
    IF NEW."expectedAmount" <> fee_total THEN
      RAISE EXCEPTION 'payment_obligations_amount_matches_fee: expected amount must equal the fee total'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_amount_matches_fee';
    END IF;
    IF NEW."voidedAt" IS NOT NULL OR NEW."closedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'payment_obligations_immutable: cannot insert a voided or closed obligation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_immutable';
    END IF;
    IF NEW."replacesObligationId" IS NOT NULL THEN
      SELECT * INTO replaced FROM "payment_obligations" WHERE "id" = NEW."replacesObligationId";
      IF replaced."voidedAt" IS NULL OR replaced."studentId" <> NEW."studentId"
         OR replaced."groupId" <> NEW."groupId" OR replaced."academicYearId" <> NEW."academicYearId" THEN
        RAISE EXCEPTION 'payment_obligations_replacement: replaces a voided obligation of the same student, group and year'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_replacement';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."studentId" <> OLD."studentId" OR NEW."groupFeeId" <> OLD."groupFeeId"
     OR NEW."groupId" <> OLD."groupId" OR NEW."academicYearId" <> OLD."academicYearId"
     OR NEW."expectedAmount" <> OLD."expectedAmount"
     OR NEW."replacesObligationId" IS DISTINCT FROM OLD."replacesObligationId"
     OR (OLD."voidedAt" IS NOT NULL AND NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt")
     OR (OLD."closedAt" IS NOT NULL AND NEW."closedAt" IS DISTINCT FROM OLD."closedAt") THEN
    RAISE EXCEPTION 'payment_obligations_immutable: an obligation cannot be rewritten'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_immutable';
  END IF;
  IF OLD."closedAt" IS NULL AND NEW."closedAt" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "obligation_transfers" t WHERE t."fromObligationId" = NEW."id") THEN
    RAISE EXCEPTION 'payment_obligations_close_by_transfer: an obligation is closed only by a transfer'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_close_by_transfer';
  END IF;
  IF OLD."voidedAt" IS NULL AND NEW."voidedAt" IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "payments" p WHERE p."obligationId" = NEW."id" AND p."voidedAt" IS NULL) THEN
      RAISE EXCEPTION 'payment_obligations_void_without_payments: void its payments first'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_void_without_payments';
    END IF;
    IF NEW."closedAt" IS NOT NULL OR EXISTS (
         SELECT 1 FROM "obligation_transfers" t WHERE t."toObligationId" = NEW."id" OR t."fromObligationId" = NEW."id") THEN
      RAISE EXCEPTION 'payment_obligations_void_with_transfer: an obligation with a transfer is never voided'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_void_with_transfer';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Payments: append-only (unchanged), plus: never on a closed obligation; the
-- limit counts the credit received; a payment whose amount was carried to
-- another group (closed obligation) is never voided
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE obligation record; settled numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT o."expectedAmount", o."voidedAt", o."closedAt" INTO obligation
      FROM "payment_obligations" o WHERE o."id" = NEW."obligationId" FOR UPDATE;
    IF obligation."voidedAt" IS NOT NULL OR NEW."voidedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'payments_live_obligation: payment on a voided obligation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_live_obligation';
    END IF;
    IF obligation."closedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'payments_closed_obligation: payment on an obligation closed by a transfer'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_closed_obligation';
    END IF;
    settled := obligation_settled(NEW."obligationId");
    IF settled + NEW."amount" > obligation."expectedAmount" THEN
      RAISE EXCEPTION 'payments_no_overpayment: total paid would exceed the obligation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_no_overpayment';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."obligationId" <> OLD."obligationId" OR NEW."amount" <> OLD."amount"
     OR NEW."paidAt" <> OLD."paidAt" OR NEW."method" <> OLD."method"
     OR NEW."periodNumber" IS DISTINCT FROM OLD."periodNumber"
     OR NEW."note" IS DISTINCT FROM OLD."note"
     OR NEW."recordedByUserId" <> OLD."recordedByUserId" OR NEW."createdAt" <> OLD."createdAt"
     OR (OLD."voidedAt" IS NOT NULL AND (NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt"
         OR NEW."receiptIssued" <> OLD."receiptIssued")) THEN
    RAISE EXCEPTION 'payments_immutable: a recorded payment cannot be rewritten'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_immutable';
  END IF;
  IF OLD."voidedAt" IS NULL AND NEW."voidedAt" IS NOT NULL THEN
    -- Serialized with transfers (same row lock)
    SELECT o."closedAt" INTO obligation
      FROM "payment_obligations" o WHERE o."id" = NEW."obligationId" FOR UPDATE;
    IF obligation."closedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'payments_credit_transferred: this payment was carried to another group and cannot be voided'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_credit_transferred';
    END IF;
  END IF;
  RETURN NEW;
END $$;
