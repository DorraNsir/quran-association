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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { AccountsService } from './accounts.service.js';
import {
  AccountListQueryDto,
  CreateAccountDto,
  ResetPasswordDto,
  SetRolesDto,
  UpdateAccountDto,
} from './dto/account-request.dto.js';
import {
  AccountDetailDto,
  AccountListDto,
} from './dto/account-response.dto.js';

const Id = () => Param('id', new ParseUUIDPipe());

/** إدارة الحسابات — ADMIN only. Personal self-service lives in /api/profile. */
@ApiTags('admin / accounts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
@ApiForbiddenResponse({
  description: 'FORBIDDEN_ROLE (ADMIN required) or PASSWORD_CHANGE_REQUIRED',
})
@Roles(Role.ADMIN)
@Controller('admin/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List accounts (paginated; search by username / first / last name; filter by role, status)',
  })
  @ApiOkResponse({ type: AccountListDto })
  list(@Query() query: AccountListQueryDto): Promise<AccountListDto> {
    return this.accounts.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One account (with its live session count)' })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiNotFoundResponse({ description: 'ACCOUNT_NOT_FOUND' })
  get(@Id() id: string): Promise<AccountDetailDto> {
    return this.accounts.get(id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Provision an account for an existing Person (personId) or a new one (person)',
    description:
      'Temporary password, mustChangePassword = true, active. Never creates Teacher/Student profiles.',
  })
  @ApiCreatedResponse({ type: AccountDetailDto })
  @ApiBadRequestResponse({ description: 'Invalid body, PERSON_REQUIRED' })
  @ApiNotFoundResponse({ description: 'PERSON_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'USERNAME_TAKEN, PERSON_ALREADY_HAS_ACCOUNT',
  })
  create(@Body() dto: CreateAccountDto): Promise<AccountDetailDto> {
    return this.accounts.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Change the username and/or the canonical Person details (sessions are kept)',
  })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiNotFoundResponse({ description: 'ACCOUNT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'USERNAME_TAKEN' })
  update(
    @Id() id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountDetailDto> {
    return this.accounts.update(id, dto);
  }

  @Put(':id/roles')
  @ApiOperation({
    summary: 'Replace the role set (≥ 1 role; effective on the next request)',
  })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiConflictResponse({ description: 'LAST_ACTIVE_ADMIN, SELF_LOCKOUT' })
  setRoles(
    @CurrentUser() actor: AuthPrincipal,
    @Id() id: string,
    @Body() dto: SetRolesDto,
  ): Promise<AccountDetailDto> {
    return this.accounts.setRoles(actor, id, dto);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-enable an account (old sessions stay revoked)' })
  @ApiOkResponse({ type: AccountDetailDto })
  activate(@Id() id: string): Promise<AccountDetailDto> {
    return this.accounts.activate(id);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable an account and revoke all its sessions immediately',
  })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiConflictResponse({ description: 'LAST_ACTIVE_ADMIN, SELF_LOCKOUT' })
  deactivate(
    @CurrentUser() actor: AuthPrincipal,
    @Id() id: string,
  ): Promise<AccountDetailDto> {
    return this.accounts.deactivate(actor, id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set a temporary password (mustChangePassword = true, all sessions revoked)',
    description:
      'The current password is never readable. Not usable on your own account (use /api/auth/change-password).',
  })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiConflictResponse({ description: 'SELF_LOCKOUT' })
  resetPassword(
    @CurrentUser() actor: AuthPrincipal,
    @Id() id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<AccountDetailDto> {
    return this.accounts.resetPassword(actor, id, dto.temporaryPassword);
  }
}
