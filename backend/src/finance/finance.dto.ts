import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { trim } from '../academic/shared.dto.js';
import { OptionalText } from '../common/contact-fields.js';
import { IsDateOnly } from '../common/dates.js';
import { PaginationMetaDto, PaginationQueryDto } from '../common/pagination.js';
import {
  BillingType,
  PaymentMethod,
  RecordStatus,
} from '../generated/prisma/enums.js';
import { IsMoney, PAYMENT_STATUSES, type PaymentStatus } from './money.js';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

const Reason = (description: string) =>
  applyDecorators(
    ApiProperty({ maxLength: 300, description }),
    Transform(trim),
    IsString({ message: 'السبب مطلوب' }),
    MinLength(1, { message: 'السبب مطلوب' }),
    MaxLength(300),
  );

/* ------------------------------ refs ------------------------------ */

export class RefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class YearRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
}

export class UserRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
}

export class StudentRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

export class VoidInfoDto {
  @ApiProperty() at!: Date;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  by!: UserRefDto | null;
  @ApiProperty() reason!: string;
}

/* ---------------------------- group fees ---------------------------- */

/** The fee of a Group for one academic year; every class of the group inherits it. */
export class SetGroupFeeDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() academicYearId!: string;

  @ApiProperty({ maxLength: 120, example: 'معلوم السنة الدراسية' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiPropertyOptional({
    enum: BillingType,
    enumName: 'BillingType',
    default: BillingType.YEARLY,
    description:
      'YEARLY (default): `amount` is the total required from each student for the year. MONTHLY (kept for existing clients): `amount` per month × numberOfPeriods months.',
  })
  @IsOptional()
  @IsEnum(BillingType)
  billingType?: BillingType;

  @IsMoney('YEARLY: total per student for the year (TND); MONTHLY: per month')
  amount!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 12,
    default: 1,
    description: 'MONTHLY only (number of months); must be 1 for YEARLY',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  numberOfPeriods?: number;

  @IsDateOnly({ optional: true, description: 'Informational, within the year' })
  startDate?: string;
  @IsDateOnly({ optional: true, description: 'Informational, within the year' })
  endDate?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    isArray: true,
    description:
      '«تعديل المعلوم»: EXACTLY the obligations of the reprice preview `toUpdate` list, confirmed by the administrator (re-checked under lock; any difference → 409 FEE_REPRICE_STALE). Required when the preview lists some',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  repriceObligationIds?: string[];
}

export class RepricePreviewQueryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() academicYearId!: string;
  @IsMoney('The new amount (as in SetGroupFeeDto)')
  amount!: string;
  @ApiPropertyOptional({ enum: BillingType, enumName: 'BillingType' })
  @IsOptional()
  @IsEnum(BillingType)
  billingType?: BillingType;
  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  numberOfPeriods?: number;
}

/** Why an obligation keeps its amount when the fee changes */
export const REPRICE_PROTECTIONS = [
  'HAS_PAYMENTS',
  'HAS_VOIDED_PAYMENTS',
  'HAS_TRANSFER_CREDIT',
  'STUDENT_INACTIVE',
  'LEFT_GROUP',
] as const;
export type RepriceProtection = (typeof REPRICE_PROTECTIONS)[number];

export class RepriceItemDto {
  @ApiProperty() obligationId!: string;
  @ApiProperty({ type: StudentRefDto }) student!: StudentRefDto;
  @ApiProperty({ example: '120.000' }) currentAmount!: string;
  @ApiProperty({ example: '200.000' }) newAmount!: string;
}

export class RepriceProtectedDto {
  @ApiProperty() obligationId!: string;
  @ApiProperty({ type: StudentRefDto }) student!: StudentRefDto;
  @ApiProperty({ example: '120.000' }) currentAmount!: string;
  @ApiProperty({ enum: REPRICE_PROTECTIONS, isArray: true })
  reasons!: RepriceProtection[];
}

export class GroupFeeQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class ApplicableFeeQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Default: the current academic year',
  })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class GroupFeeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: RefDto }) group!: RefDto;
  @ApiProperty({ type: YearRefDto }) academicYear!: YearRefDto;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: BillingType, enumName: 'BillingType' })
  billingType!: BillingType;
  @ApiProperty({ example: '20.000', description: 'Per period' })
  amount!: string;
  @ApiProperty() numberOfPeriods!: number;
  @ApiProperty({
    example: '40.000',
    description: 'amount × numberOfPeriods: what a new obligation is charged',
  })
  totalAmount!: string;
  @ApiProperty({ example: 'TND' }) currency!: string;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  startDate!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  endDate!: string | null;
  @ApiProperty({
    description: 'false once replaced by a newer version or stopped',
  })
  isActive!: boolean;
  @ApiProperty({
    enum: ['ACTIVE', 'REPLACED', 'STOPPED'],
    description:
      'REPLACED: a newer version took over («استُبدل»); STOPPED: deactivated without a replacement («موقوف»)',
  })
  status!: 'ACTIVE' | 'REPLACED' | 'STOPPED';
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  createdBy!: UserRefDto | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  deactivatedAt!: Date | null;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  deactivatedBy!: UserRefDto | null;
  @ApiProperty({ description: 'Live obligations charged from this version' })
  obligationsCount!: number;
}

export class GroupFeeListDto {
  @ApiProperty({
    type: GroupFeeDto,
    isArray: true,
    description: 'Newest first',
  })
  data!: GroupFeeDto[];
}

export class RepricePreviewDto {
  @ApiProperty({ type: YearRefDto }) academicYear!: YearRefDto;
  @ApiPropertyOptional({ type: GroupFeeDto, nullable: true })
  currentFee!: GroupFeeDto | null;
  @ApiProperty({ example: '200.000', description: 'New total per student' })
  newTotalAmount!: string;
  @ApiProperty({
    type: RepriceItemDto,
    isArray: true,
    description:
      'Live, never-paid obligations of active current members: voided and replaced at the new total',
  })
  toUpdate!: RepriceItemDto[];
  @ApiProperty({
    type: RepriceProtectedDto,
    isArray: true,
    description: 'Kept unchanged, with the reasons',
  })
  protected!: RepriceProtectedDto[];
  @ApiProperty({ description: 'Live obligations already at the new amount' })
  unchangedCount!: number;
}

export class ApplicableFeeDto {
  @ApiProperty() groupClassId!: string;
  @ApiProperty({ type: RefDto }) group!: RefDto;
  @ApiProperty({ type: YearRefDto }) academicYear!: YearRefDto;
  @ApiPropertyOptional({
    type: GroupFeeDto,
    nullable: true,
    description: 'The active fee of the class group (null: no fee set)',
  })
  fee!: GroupFeeDto | null;
}

/* ---------------------------- obligations ---------------------------- */

export class CreateObligationDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() studentId!: string;
  @ApiProperty({
    format: 'uuid',
    description:
      'An ACTIVE fee; the student must have been enrolled in a class of its group during its academic year',
  })
  @IsUUID()
  groupFeeId!: string;
  @OptionalText(300) note?: string | null;
}

export class VoidDto {
  @Reason('Why this record is voided (kept for the audit trail)')
  reason!: string;
}

export class ObligationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  studentId?: string;
  @ApiPropertyOptional({
    enum: PAYMENT_STATUSES,
    description: 'Derived status',
  })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: PaymentStatus;
  @ApiPropertyOptional({ default: false, description: 'Include voided ones' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeVoided?: boolean;
  @ApiPropertyOptional({ description: 'Student name contains' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class YearFilterQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

class ObligationFeeDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: BillingType, enumName: 'BillingType' })
  billingType!: BillingType;
  @ApiProperty({ example: '20.000' }) amount!: string;
  @ApiProperty() numberOfPeriods!: number;
  @ApiProperty() isActive!: boolean;
}

export class ObligationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: StudentRefDto }) student!: StudentRefDto;
  @ApiProperty({ type: RefDto }) group!: RefDto;
  @ApiProperty({ type: YearRefDto }) academicYear!: YearRefDto;
  @ApiProperty({ type: ObligationFeeDto }) fee!: ObligationFeeDto;
  @ApiProperty({ example: 'TND' }) currency!: string;
  @ApiProperty({
    example: '40.000',
    description: 'Frozen at creation (fee changes never rewrite it)',
  })
  expectedAmount!: string;
  @ApiProperty({
    example: '40.000',
    description:
      'What is still required: expectedAmount − releasedAmount (a transfer to another group releases it)',
  })
  requiredAmount!: string;
  @ApiProperty({
    example: '15.000',
    description: 'CASH: live (non-voided) payments only',
  })
  totalPaid!: string;
  @ApiProperty({
    example: '0.000',
    description: 'Credit received from a previous group (not cash)',
  })
  creditIn!: string;
  @ApiProperty({
    example: '0.000',
    description: 'Credit carried to the next group',
  })
  creditOut!: string;
  @ApiProperty({ example: '0.000' }) releasedAmount!: string;
  @ApiProperty({
    example: '15.000',
    description: 'cash + creditIn − creditOut',
  })
  settledAmount!: string;
  @ApiProperty({
    example: '25.000',
    description: 'max(0, required − settled)',
  })
  remainingAmount!: string;
  @ApiProperty({
    example: '0.000',
    description: 'max(0, settled − required): «رصيد زائد»',
  })
  excessAmount!: string;
  @ApiProperty({
    enum: PAYMENT_STATUSES,
    description: 'Derived: UNPAID / PARTIAL / PAID (informational only)',
  })
  status!: PaymentStatus;
  @ApiProperty() paymentsCount!: number;
  @ApiProperty({ description: 'Live payments whose receipt is not issued' })
  receiptsNotIssued!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  createdBy!: UserRefDto | null;
  @ApiPropertyOptional({ type: VoidInfoDto, nullable: true })
  voided!: VoidInfoDto | null;
  @ApiPropertyOptional({
    type: () => ClosedInfoDto,
    nullable: true,
    description: 'Closed by a transfer to another group',
  })
  closed!: ClosedInfoDto | null;
  @ApiProperty({ type: () => CreditInfoDto, isArray: true })
  creditsReceived!: CreditInfoDto[];
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '«تعديل المعلوم»: the voided obligation this one replaces',
  })
  replacesObligationId!: string | null;
}

export class ClosedInfoDto {
  @ApiProperty() at!: Date;
  @ApiProperty({ type: RefDto }) toGroup!: RefDto;
  @ApiProperty() creditAmount!: string;
  @ApiProperty() excessAmount!: string;
  @ApiProperty({ format: 'date' }) effectiveDate!: string;
}

export class CreditInfoDto {
  @ApiProperty({ type: RefDto }) fromGroup!: RefDto;
  @ApiProperty() amount!: string;
  @ApiProperty() at!: Date;
}

export class ObligationListDto {
  @ApiProperty({ type: ObligationDto, isArray: true }) data!: ObligationDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/* ------------------------------ payments ------------------------------ */

export class CreatePaymentDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() obligationId!: string;
  @IsMoney('Cash received (TND), > 0 and ≤ the remaining balance')
  amount!: string;
  @IsDateOnly({
    optional: true,
    description: 'Default: today (platform timezone); not in the future',
  })
  paidAt?: string;
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 12,
    description: 'MONTHLY fees only: which month (1..numberOfPeriods)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodNumber?: number;
  @OptionalText(300) note?: string | null;
  @ApiPropertyOptional({
    default: false,
    description:
      'The admin hands the receipt now (explicit choice, never automatic)',
  })
  @IsOptional()
  @IsBoolean()
  receiptIssued?: boolean;
}

export class SetReceiptDto {
  @ApiProperty() @IsBoolean() receiptIssued!: boolean;
}

export class PaymentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  studentId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  obligationId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @IsDateOnly({ optional: true, description: 'Paid on/after (inclusive)' })
  from?: string;
  @IsDateOnly({ optional: true, description: 'Paid on/before (inclusive)' })
  to?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  receiptIssued?: boolean;
  @ApiPropertyOptional({ default: false, description: 'Include voided ones' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeVoided?: boolean;
}

export class PaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty() obligationId!: string;
  @ApiProperty({ type: StudentRefDto }) student!: StudentRefDto;
  @ApiProperty({ type: RefDto }) group!: RefDto;
  @ApiProperty({ type: YearRefDto }) academicYear!: YearRefDto;
  @ApiProperty({ example: '15.000' }) amount!: string;
  @ApiProperty({ example: 'TND' }) currency!: string;
  @ApiProperty({ format: 'date' }) paidAt!: string;
  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  method!: PaymentMethod;
  @ApiPropertyOptional({ type: Number, nullable: true })
  periodNumber!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() receiptIssued!: boolean;
  @ApiPropertyOptional({ type: Date, nullable: true })
  receiptIssuedAt!: Date | null;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  receiptIssuedBy!: UserRefDto | null;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  recordedBy!: UserRefDto | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({
    type: VoidInfoDto,
    nullable: true,
    description: 'Voided payments are kept but excluded from every total',
  })
  voided!: VoidInfoDto | null;
}

export class PaymentListDto {
  @ApiProperty({ type: PaymentDto, isArray: true }) data!: PaymentDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/* ------------------------------ summaries ------------------------------ */

export class TotalsDto {
  @ApiProperty({ example: '120.000', description: 'Σ required amounts' })
  expectedAmount!: string;
  @ApiProperty({
    example: '45.000',
    description: 'Σ CASH payments (credit carried between groups is not cash)',
  })
  totalPaid!: string;
  @ApiProperty({
    example: '0.000',
    description:
      'Net credit carried INTO these obligations from others (0 association-wide)',
  })
  creditAmount!: string;
  @ApiProperty({ example: '75.000', description: 'Σ remaining' })
  remainingAmount!: string;
  @ApiProperty({ example: '0.000', description: 'Σ excess («رصيد زائد»)' })
  excessAmount!: string;
}

export class StatusCountsDto {
  @ApiProperty() UNPAID!: number;
  @ApiProperty() PARTIAL!: number;
  @ApiProperty() PAID!: number;
  @ApiProperty({ description: 'Closed by a transfer to another group' })
  CLOSED!: number;
}

export class ReceiptCountsDto {
  @ApiProperty({ description: 'Live payments with the receipt issued' })
  issued!: number;
  @ApiProperty({ description: 'Live payments without receipt yet' })
  notIssued!: number;
}

class StudentClassDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: RefDto }) group!: RefDto;
  @ApiProperty({ type: RefDto }) branch!: RefDto;
}

class StudentFinanceInfoDto extends StudentRefDto {
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiPropertyOptional({ type: StudentClassDto, nullable: true })
  currentClass!: StudentClassDto | null;
}

export class StudentFinanceSummaryDto {
  @ApiProperty({ type: StudentFinanceInfoDto }) student!: StudentFinanceInfoDto;
  @ApiPropertyOptional({ type: YearRefDto, nullable: true })
  academicYear!: YearRefDto | null;
  @ApiProperty({ example: 'TND' }) currency!: string;
  @ApiProperty({
    type: ObligationDto,
    isArray: true,
    description: 'Live obligations (voided ones are excluded)',
  })
  obligations!: ObligationDto[];
  @ApiProperty({ type: TotalsDto }) totals!: TotalsDto;
  @ApiProperty({ type: StatusCountsDto }) statusCounts!: StatusCountsDto;
  @ApiProperty({ type: ReceiptCountsDto }) receipts!: ReceiptCountsDto;
}

export class FinanceSummaryQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Obligations of students enrolled in a class of this branch (in the obligation group, during its year)',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @IsDateOnly({
    optional: true,
    description: 'Payment date (paidAt) on/after — affects `collected` only',
  })
  from?: string;
  @IsDateOnly({
    optional: true,
    description: 'Payment date (paidAt) on/before — affects `collected` only',
  })
  to?: string;
}

export class CollectedDto {
  @ApiProperty({ description: 'Live payments with paidAt in [from, to]' })
  paymentsCount!: number;
  @ApiProperty({ example: '300.000' }) amount!: string;
  @ApiProperty({ description: 'Of those, receipts not issued' })
  receiptsNotIssued!: number;
  @ApiProperty({ description: 'Voided payments with paidAt in [from, to]' })
  voidedPaymentsCount!: number;
}

export class FinanceSummaryDto {
  @ApiProperty({ example: 'TND' }) currency!: string;
  @ApiProperty({
    description:
      'Live obligations matching academicYearId / groupId / branchId (dates do not filter obligations)',
  })
  obligationsCount!: number;
  @ApiProperty({
    type: TotalsDto,
    description:
      'Balance of those obligations today (all their live payments, whatever the date)',
  })
  totals!: TotalsDto;
  @ApiProperty({ type: StatusCountsDto }) statusCounts!: StatusCountsDto;
  @ApiProperty({
    type: CollectedDto,
    description:
      'Cash received for those obligations within the payment-date range',
  })
  collected!: CollectedDto;
}

/* ------------------------- transfers between groups ------------------------- */

/** A confirmed «نقل مالي» (as shown by the preview): checked again under lock. */
export class FinancialTransferConfirmDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() fromObligationId!: string;
  @ApiProperty({
    example: '60.000',
    description: 'The credit shown by the preview (may be 0)',
  })
  @IsString()
  @Matches(/^\d{1,7}(?:\.\d{1,3})?$/, { message: 'مبلغ غير صالح' })
  creditAmount!: string;
}

export class FinancialTransfersDto {
  @ApiPropertyOptional({
    type: FinancialTransferConfirmDto,
    isArray: true,
    description:
      'Moving to ANOTHER group: the transfers of the preview, confirmed (required when it lists some)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FinancialTransferConfirmDto)
  financialTransfers?: FinancialTransferConfirmDto[];
}

class TransferSourceDto {
  @ApiProperty() obligationId!: string;
  @ApiProperty({ type: RefDto }) group!: RefDto;
  @ApiProperty() requiredAmount!: string;
  @ApiProperty({ description: 'Cash paid on it' }) cashPaid!: string;
  @ApiProperty() creditIn!: string;
  @ApiProperty() settledAmount!: string;
}

class TransferTargetDto {
  @ApiProperty({ type: RefDto }) group!: RefDto;
  @ApiPropertyOptional({ type: String, nullable: true })
  feeId!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'What the new group requires (null: no active fee)',
  })
  requiredAmount!: string | null;
}

export class TransferItemDto {
  @ApiProperty({ type: YearRefDto }) academicYear!: YearRefDto;
  @ApiProperty({ type: TransferSourceDto }) from!: TransferSourceDto;
  @ApiProperty({ type: TransferTargetDto }) to!: TransferTargetDto;
  @ApiProperty() creditAmount!: string;
  @ApiProperty({ description: 'Stays on the old obligation («رصيد زائد»)' })
  excessAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  remainingAfter!: string | null;
  @ApiPropertyOptional({
    enum: ['NO_TARGET_FEE'],
    nullable: true,
    description: 'Why this transfer cannot be applied',
  })
  blocked!: 'NO_TARGET_FEE' | null;
}

export class TransferPlanDto {
  @ApiProperty({
    description: 'A class of the same group: no financial change',
  })
  sameGroup!: boolean;
  @ApiProperty({ type: RefDto }) targetGroup!: RefDto;
  @ApiProperty({ type: TransferItemDto, isArray: true })
  transfers!: TransferItemDto[];
}
