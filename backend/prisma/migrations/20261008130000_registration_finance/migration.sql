-- Part 10.7 — registration requests, group fees, payment obligations, cash payments.
-- The finance tables are empty before this migration (no fee/obligation/payment
-- workflow existed), so the new NOT NULL columns need no backfill.

-- DropForeignKey
ALTER TABLE "payment_obligations" DROP CONSTRAINT "payment_obligations_groupFeeId_fkey";

-- DropIndex
DROP INDEX "payment_obligations_studentId_groupFeeId_key";

-- AlterTable
ALTER TABLE "group_fees" ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "deactivatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deactivatedByUserId" UUID,
ALTER COLUMN "academicYearId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payment_obligations" ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "groupId" UUID NOT NULL,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "voidedByUserId" UUID,
ALTER COLUMN "academicYearId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "receiptIssuedAt" TIMESTAMPTZ(3),
ADD COLUMN     "receiptIssuedByUserId" UUID,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "voidedByUserId" UUID;

-- AlterTable
ALTER TABLE "registration_requests" ADD COLUMN     "address" TEXT,
ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "guardianPhone" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "group_fees_one_active_key" ON "group_fees"("groupId", "academicYearId") WHERE ("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "group_fees_id_groupId_academicYearId_key" ON "group_fees"("id", "groupId", "academicYearId");

-- CreateIndex
CREATE INDEX "payment_obligations_groupId_academicYearId_idx" ON "payment_obligations"("groupId", "academicYearId");

-- CreateIndex
CREATE INDEX "payment_obligations_groupFeeId_idx" ON "payment_obligations"("groupFeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_obligations_one_live_key" ON "payment_obligations"("studentId", "groupId", "academicYearId") WHERE ("voidedAt" IS NULL);

-- AddForeignKey
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_deactivatedByUserId_fkey" FOREIGN KEY ("deactivatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_groupFeeId_groupId_academicYearId_fkey" FOREIGN KEY ("groupFeeId", "groupId", "academicYearId") REFERENCES "group_fees"("id", "groupId", "academicYearId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receiptIssuedByUserId_fkey" FOREIGN KEY ("receiptIssuedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Registration requests: a review is all-or-nothing and matches the status.
-- PENDING → ACCEPTED (with the created/linked student) or PENDING → REFUSED.
-- ---------------------------------------------------------------------------
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_birth_or_age_check"
  CHECK ("birthDate" IS NOT NULL OR "age" IS NOT NULL);
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_source_check"
  CHECK (("source" = 'ADMIN') = ("createdByUserId" IS NOT NULL));
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_review_check" CHECK (
  ("status" = 'PENDING' AND "reviewedAt" IS NULL AND "reviewedByUserId" IS NULL
     AND "createdStudentId" IS NULL AND "rejectionReason" IS NULL)
  OR ("status" = 'ACCEPTED' AND "reviewedAt" IS NOT NULL AND "reviewedByUserId" IS NOT NULL
     AND "createdStudentId" IS NOT NULL AND "rejectionReason" IS NULL)
  OR ("status" = 'REFUSED' AND "reviewedAt" IS NOT NULL AND "reviewedByUserId" IS NOT NULL
     AND "createdStudentId" IS NULL)
);

-- A reviewed request is final (no un-accepting / un-refusing).
CREATE FUNCTION registration_requests_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'PENDING' AND (NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."createdStudentId" IS DISTINCT FROM OLD."createdStudentId") THEN
    RAISE EXCEPTION 'registration_requests_final: a reviewed request cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'registration_requests_final';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registration_requests_guard BEFORE UPDATE ON "registration_requests"
  FOR EACH ROW EXECUTE FUNCTION registration_requests_guard();

-- ---------------------------------------------------------------------------
-- Group fees: versioned pricing. Pricing fields never change in place; a new
-- version is a new row and the previous one is deactivated (never reactivated).
-- ---------------------------------------------------------------------------
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_billing_check"
  CHECK (("billingType" = 'MONTHLY' AND "numberOfPeriods" BETWEEN 1 AND 12)
      OR ("billingType" = 'YEARLY' AND "numberOfPeriods" = 1));
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_active_check"
  CHECK ("isActive" = ("deactivatedAt" IS NULL));

CREATE FUNCTION group_fees_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."groupId" <> OLD."groupId" OR NEW."academicYearId" <> OLD."academicYearId"
     OR NEW."billingType" <> OLD."billingType" OR NEW."amount" <> OLD."amount"
     OR NEW."numberOfPeriods" <> OLD."numberOfPeriods" THEN
    RAISE EXCEPTION 'group_fees_immutable: pricing fields of a fee cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'group_fees_immutable';
  END IF;
  IF NEW."isActive" AND NOT OLD."isActive" THEN
    RAISE EXCEPTION 'group_fees_immutable: a deactivated fee cannot be reactivated'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'group_fees_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_fees_guard BEFORE UPDATE ON "group_fees"
  FOR EACH ROW EXECUTE FUNCTION group_fees_guard();

-- ---------------------------------------------------------------------------
-- Payment obligations: the amount is the fee total at creation, then frozen.
-- Voiding is the only correction and requires no live payment.
-- ---------------------------------------------------------------------------
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_void_check" CHECK (
  ("voidedAt" IS NULL AND "voidedByUserId" IS NULL AND "voidReason" IS NULL)
  OR ("voidedAt" IS NOT NULL AND "voidedByUserId" IS NOT NULL AND "voidReason" IS NOT NULL)
);

CREATE FUNCTION payment_obligations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fee_total numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT f."amount" * f."numberOfPeriods" INTO fee_total
      FROM "group_fees" f WHERE f."id" = NEW."groupFeeId";
    IF NEW."expectedAmount" <> fee_total THEN
      RAISE EXCEPTION 'payment_obligations_amount_matches_fee: expected amount must equal the fee total'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_amount_matches_fee';
    END IF;
    IF NEW."voidedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'payment_obligations_immutable: cannot insert a voided obligation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."studentId" <> OLD."studentId" OR NEW."groupFeeId" <> OLD."groupFeeId"
     OR NEW."groupId" <> OLD."groupId" OR NEW."academicYearId" <> OLD."academicYearId"
     OR NEW."expectedAmount" <> OLD."expectedAmount"
     OR (OLD."voidedAt" IS NOT NULL AND NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt") THEN
    RAISE EXCEPTION 'payment_obligations_immutable: an obligation cannot be rewritten'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_immutable';
  END IF;
  IF OLD."voidedAt" IS NULL AND NEW."voidedAt" IS NOT NULL AND EXISTS (
       SELECT 1 FROM "payments" p WHERE p."obligationId" = NEW."id" AND p."voidedAt" IS NULL) THEN
    RAISE EXCEPTION 'payment_obligations_void_without_payments: void its payments first'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_obligations_void_without_payments';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_obligations_guard BEFORE INSERT OR UPDATE ON "payment_obligations"
  FOR EACH ROW EXECUTE FUNCTION payment_obligations_guard();

-- ---------------------------------------------------------------------------
-- Payments: append-only cash transactions. Live payments never exceed the
-- obligation (checked under the obligation row lock, so concurrent inserts
-- serialize); corrections are voids; only the receipt flag may change.
-- ---------------------------------------------------------------------------
ALTER TABLE "payments" ADD CONSTRAINT "payments_void_check" CHECK (
  ("voidedAt" IS NULL AND "voidedByUserId" IS NULL AND "voidReason" IS NULL)
  OR ("voidedAt" IS NOT NULL AND "voidedByUserId" IS NOT NULL AND "voidReason" IS NOT NULL)
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_check" CHECK (
  ("receiptIssued" AND "receiptIssuedAt" IS NOT NULL AND "receiptIssuedByUserId" IS NOT NULL)
  OR (NOT "receiptIssued" AND "receiptIssuedAt" IS NULL AND "receiptIssuedByUserId" IS NULL)
);

CREATE FUNCTION payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected numeric; obligation_voided timestamptz; paid numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT o."expectedAmount", o."voidedAt" INTO expected, obligation_voided
      FROM "payment_obligations" o WHERE o."id" = NEW."obligationId" FOR UPDATE;
    IF obligation_voided IS NOT NULL OR NEW."voidedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'payments_live_obligation: payment on a voided obligation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_live_obligation';
    END IF;
    SELECT COALESCE(SUM(p."amount"), 0) INTO paid
      FROM "payments" p WHERE p."obligationId" = NEW."obligationId" AND p."voidedAt" IS NULL;
    IF paid + NEW."amount" > expected THEN
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
  RETURN NEW;
END $$;
CREATE TRIGGER payments_guard BEFORE INSERT OR UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION payments_guard();
