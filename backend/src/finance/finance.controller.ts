import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { FinanceSummaryService } from './finance-summary.service.js';
import {
  ApplicableFeeDto,
  ApplicableFeeQueryDto,
  CreateObligationDto,
  CreatePaymentDto,
  FinanceSummaryDto,
  FinanceSummaryQueryDto,
  GroupFeeDto,
  GroupFeeListDto,
  GroupFeeQueryDto,
  ObligationDto,
  ObligationListDto,
  ObligationListQueryDto,
  PaymentDto,
  PaymentListDto,
  PaymentListQueryDto,
  SetGroupFeeDto,
  SetReceiptDto,
  StudentFinanceSummaryDto,
  VoidDto,
  YearFilterQueryDto,
} from './finance.dto.js';
import { GroupFeesService } from './group-fees.service.js';
import { ObligationsService } from './obligations.service.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('admin / group fees')
@AdminApi()
@Controller('admin')
export class GroupFeesController {
  constructor(private readonly fees: GroupFeesService) {}

  @Get('groups/:groupId/fees')
  @ApiOperation({
    summary: 'Fee versions of a group (history, newest first)',
  })
  @ApiOkResponse({ type: GroupFeeListDto })
  @ApiNotFoundResponse({ description: 'GROUP_NOT_FOUND' })
  list(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: GroupFeeQueryDto,
  ): Promise<GroupFeeListDto> {
    return this.fees.listForGroup(groupId, query);
  }

  @Put('groups/:groupId/fees')
  @ApiOperation({
    summary: 'Set the fee of a group for an academic year (new version)',
    description:
      'Creates a new active version and deactivates the previous one (kept as history). Existing obligations keep the amount they were charged; no obligation is created automatically.',
  })
  @ApiOkResponse({ type: GroupFeeDto })
  @ApiBadRequestResponse({
    description:
      'Validation (amount > 0, ≤ 3 decimals), INVALID_NUMBER_OF_PERIODS, INVALID_DATE_RANGE, FEE_DATES_OUTSIDE_YEAR',
  })
  @ApiNotFoundResponse({
    description: 'GROUP_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  @ApiConflictResponse({
    description: 'GROUP_ARCHIVED, GROUP_FEE_CONCURRENT_UPDATE',
  })
  set(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: SetGroupFeeDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<GroupFeeDto> {
    return this.fees.setForGroup(groupId, dto, user.userId);
  }

  @Get('group-fees/:id')
  @ApiOkResponse({ type: GroupFeeDto })
  @ApiNotFoundResponse({ description: 'GROUP_FEE_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GroupFeeDto> {
    return this.fees.get(id);
  }

  @Post('group-fees/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop a fee without replacement (history and obligations kept)',
  })
  @ApiOkResponse({ type: GroupFeeDto })
  @ApiNotFoundResponse({ description: 'GROUP_FEE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'GROUP_FEE_INACTIVE' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<GroupFeeDto> {
    return this.fees.deactivate(id, user.userId);
  }

  @Get('group-classes/:id/fee')
  @ApiOperation({
    summary: 'The fee a class inherits from its group (default: current year)',
  })
  @ApiOkResponse({ type: ApplicableFeeDto })
  @ApiNotFoundResponse({
    description:
      'GROUP_CLASS_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND, NO_CURRENT_ACADEMIC_YEAR',
  })
  applicable(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ApplicableFeeQueryDto,
  ): Promise<ApplicableFeeDto> {
    return this.fees.applicableToClass(id, query.academicYearId);
  }
}

@ApiTags('admin / payment obligations')
@AdminApi()
@Controller('admin')
export class ObligationsController {
  constructor(
    private readonly obligations: ObligationsService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('payment-obligations')
  @ApiOperation({
    summary:
      'Obligations (filters: academic year, group, student, derived status, student name)',
  })
  @ApiOkResponse({ type: ObligationListDto })
  list(@Query() query: ObligationListQueryDto): Promise<ObligationListDto> {
    return this.obligations.list(query);
  }

  @Post('payment-obligations')
  @ApiOperation({
    summary:
      'Charge a student from an active group fee (explicit, never automatic)',
    description:
      'The amount is the fee total now (amount × periods) and is frozen. One live obligation per student, group and academic year; the student must have been enrolled in a class of the group during that year.',
  })
  @ApiCreatedResponse({ type: ObligationDto })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, GROUP_FEE_NOT_FOUND',
  })
  @ApiConflictResponse({
    description: 'GROUP_FEE_INACTIVE, STUDENT_NOT_IN_GROUP, OBLIGATION_EXISTS',
  })
  create(
    @Body() dto: CreateObligationDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ObligationDto> {
    return this.obligations.create(dto, user.userId);
  }

  @Get('payment-obligations/:id')
  @ApiOkResponse({ type: ObligationDto })
  @ApiNotFoundResponse({ description: 'OBLIGATION_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ObligationDto> {
    return this.obligations.get(id);
  }

  @Get('payment-obligations/:id/payments')
  @ApiOperation({
    summary:
      'Payments of an obligation (voided included, flagged), oldest first',
  })
  @ApiOkResponse({ type: PaymentDto, isArray: true })
  @ApiNotFoundResponse({ description: 'OBLIGATION_NOT_FOUND' })
  obligationPayments(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentDto[]> {
    return this.payments.forObligation(id);
  }

  @Post('payment-obligations/:id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Void a mistaken obligation (only without live payments)',
  })
  @ApiOkResponse({ type: ObligationDto })
  @ApiNotFoundResponse({ description: 'OBLIGATION_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'OBLIGATION_VOIDED, OBLIGATION_HAS_PAYMENTS',
  })
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ObligationDto> {
    return this.obligations.void(id, dto, user.userId);
  }

  @Get('students/:studentId/payment-obligations')
  @ApiOperation({
    summary: 'Obligations of a student (voided included, flagged)',
  })
  @ApiOkResponse({ type: ObligationDto, isArray: true })
  @ApiNotFoundResponse({ description: 'STUDENT_NOT_FOUND' })
  forStudent(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: YearFilterQueryDto,
  ): Promise<ObligationDto[]> {
    return this.obligations.forStudent(studentId, query.academicYearId);
  }
}

@ApiTags('admin / payments')
@AdminApi()
@Controller('admin')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments')
  @ApiOperation({
    summary:
      'Cash payments (filters: student, obligation, year, group, paid-date range, receipt; voided excluded unless includeVoided)',
  })
  @ApiOkResponse({ type: PaymentListDto })
  list(@Query() query: PaymentListQueryDto): Promise<PaymentListDto> {
    return this.payments.list(query);
  }

  @Post('payments')
  @ApiOperation({
    summary: 'Record a cash payment against an obligation',
    description:
      'Partial payments allowed; never above the remaining balance (row-locked, concurrent-safe). The recorder is the authenticated admin.',
  })
  @ApiCreatedResponse({ type: PaymentDto })
  @ApiBadRequestResponse({
    description:
      'Validation (amount > 0, ≤ 3 decimals), PAYMENT_DATE_IN_FUTURE, PERIOD_NOT_APPLICABLE, INVALID_PERIOD',
  })
  @ApiNotFoundResponse({ description: 'OBLIGATION_NOT_FOUND' })
  @ApiConflictResponse({
    description:
      'OBLIGATION_VOIDED, OBLIGATION_FULLY_PAID, AMOUNT_EXCEEDS_REMAINING',
  })
  record(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<PaymentDto> {
    return this.payments.record(dto, user.userId);
  }

  @Get('payments/:id')
  @ApiOkResponse({ type: PaymentDto })
  @ApiNotFoundResponse({ description: 'PAYMENT_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentDto> {
    return this.payments.get(id);
  }

  @Post('payments/:id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Void a mistaken payment (kept with who/when/why, excluded from totals)',
  })
  @ApiOkResponse({ type: PaymentDto })
  @ApiNotFoundResponse({ description: 'PAYMENT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'PAYMENT_ALREADY_VOIDED' })
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<PaymentDto> {
    return this.payments.void(id, dto, user.userId);
  }

  @Patch('payments/:id/receipt')
  @ApiOperation({
    summary: 'Mark the receipt as issued / not issued (amounts unchanged)',
  })
  @ApiOkResponse({ type: PaymentDto })
  @ApiNotFoundResponse({ description: 'PAYMENT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'PAYMENT_VOIDED' })
  setReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReceiptDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<PaymentDto> {
    return this.payments.setReceipt(id, dto, user.userId);
  }

  @Get('students/:studentId/payments')
  @ApiOperation({
    summary: 'Payments of a student (voided included, flagged), oldest first',
  })
  @ApiOkResponse({ type: PaymentDto, isArray: true })
  @ApiNotFoundResponse({ description: 'STUDENT_NOT_FOUND' })
  forStudent(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: YearFilterQueryDto,
  ): Promise<PaymentDto[]> {
    return this.payments.forStudent(studentId, query.academicYearId);
  }
}

@ApiTags('admin / finance summary')
@AdminApi()
@Controller('admin')
export class FinanceSummaryController {
  constructor(private readonly summary: FinanceSummaryService) {}

  @Get('students/:studentId/finance/summary')
  @ApiOperation({
    summary:
      'Finance of one student: obligations, balances, statuses, receipts',
  })
  @ApiOkResponse({ type: StudentFinanceSummaryDto })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  forStudent(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: YearFilterQueryDto,
  ): Promise<StudentFinanceSummaryDto> {
    return this.summary.forStudent(studentId, query.academicYearId);
  }

  @Get('finance/summary')
  @ApiOperation({
    summary: 'Association finance totals (informational)',
    description:
      'academicYearId / groupId / branchId select the obligations, whose balances count all their live payments. from / to filter payments by paidAt and only affect `collected`.',
  })
  @ApiOkResponse({ type: FinanceSummaryDto })
  overall(@Query() query: FinanceSummaryQueryDto): Promise<FinanceSummaryDto> {
    return this.summary.overall(query);
  }
}
