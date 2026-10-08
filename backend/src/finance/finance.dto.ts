import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
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

  @ApiProperty({
    enum: BillingType,
    enumName: 'BillingType',
    description:
      'YEARLY: one amount for the year (also used for one-time fees). MONTHLY: `amount` per month × numberOfPeriods months.',
  })
  @IsEnum(BillingType)
  billingType!: BillingType;

  @IsMoney('Per period (TND): the yearly amount, or the monthly amount')
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
  @ApiProperty({ example: '15.000', description: 'Live (non-voided) payments' })
  totalPaid!: string;
  @ApiProperty({ example: '25.000' }) remainingAmount!: string;
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
  @ApiProperty({ example: '120.000' }) expectedAmount!: string;
  @ApiProperty({ example: '45.000' }) totalPaid!: string;
  @ApiProperty({ example: '75.000' }) remainingAmount!: string;
}

export class StatusCountsDto {
  @ApiProperty() UNPAID!: number;
  @ApiProperty() PARTIAL!: number;
  @ApiProperty() PAID!: number;
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
