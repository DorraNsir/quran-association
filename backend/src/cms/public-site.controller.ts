import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator.js';
import { PaginationMetaDto } from '../common/pagination.js';
import {
  PublicAchievementDto,
  PublicAchievementQueryDto,
  PublicBranchDto,
  PublicEventDto,
  PublicEventQueryDto,
  PublicGalleryImageDto,
  PublicGalleryQueryDto,
  PublicGraduateDto,
  PublicGroupListingDto,
  PublicHeroSlideDto,
  PublicHomeDto,
  PublicMemberDto,
  PublicNewsDto,
  PublicNewsQueryDto,
  PublicNewsSummaryDto,
  PublicProgramDto,
  PublicServiceDto,
  PublicSiteSettingsDto,
} from './cms.dto.js';
import { PublicSiteService } from './public-site.service.js';

class PublicEventListDto {
  @ApiProperty({ type: PublicEventDto, isArray: true }) data!: PublicEventDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
class PublicNewsListDto {
  @ApiProperty({ type: PublicNewsSummaryDto, isArray: true })
  data!: PublicNewsSummaryDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
class PublicGalleryListDto {
  @ApiProperty({ type: PublicGalleryImageDto, isArray: true })
  data!: PublicGalleryImageDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

const HIDDEN = {
  description:
    'CMS_CONTENT_NOT_FOUND — also for hidden, draft, future-dated or internal content (no existence leak)',
};

/**
 * The public website (no authentication, read-only): published content
 * only, explicit public fields only, no operational record (students,
 * teachers, sessions, attendance, memorization, finance) ever exposed.
 */
@ApiTags('public / website')
@Public()
@Controller('public')
export class PublicSiteController {
  constructor(private readonly site: PublicSiteService) {}

  @Get('home')
  @ApiOperation({
    summary: 'Home page: every section in one bounded, published-only response',
  })
  @ApiOkResponse({ type: PublicHomeDto })
  home(): Promise<PublicHomeDto> {
    return this.site.home();
  }

  @Get('site-settings')
  @ApiOperation({
    summary:
      'Association identity and website presentation (public fields only)',
  })
  @ApiOkResponse({ type: PublicSiteSettingsDto })
  @ApiNotFoundResponse({
    description: 'CMS_CONTENT_NOT_FOUND (not configured)',
  })
  siteSettings(): Promise<PublicSiteSettingsDto> {
    return this.site.siteSettings();
  }

  @Get('branches')
  @ApiOperation({ summary: 'Active branches: name, address, public phone' })
  @ApiOkResponse({ type: PublicBranchDto, isArray: true })
  branches(): Promise<PublicBranchDto[]> {
    return this.site.branches();
  }

  @Get('hero-slides')
  @ApiOperation({ summary: 'Active hero slides, in display order' })
  @ApiOkResponse({ type: PublicHeroSlideDto, isArray: true })
  heroSlides(): Promise<PublicHeroSlideDto[]> {
    return this.site.heroSlides();
  }

  @Get('services')
  @ApiOperation({ summary: 'Published services, in display order' })
  @ApiOkResponse({ type: PublicServiceDto, isArray: true })
  services(): Promise<PublicServiceDto[]> {
    return this.site.services();
  }

  @Get('programs')
  @ApiOperation({ summary: 'Published programs, in display order' })
  @ApiOkResponse({ type: PublicProgramDto, isArray: true })
  programs(): Promise<PublicProgramDto[]> {
    return this.site.programs();
  }

  @Get('programs/:id')
  @ApiOkResponse({ type: PublicProgramDto })
  @ApiNotFoundResponse(HIDDEN)
  program(@Param('id', ParseUUIDPipe) id: string): Promise<PublicProgramDto> {
    return this.site.program(id);
  }

  @Get('upcoming-groups')
  @ApiOperation({
    summary:
      'Announced groups opening soon / open for registration (CLOSED excluded), in display order',
  })
  @ApiOkResponse({ type: PublicGroupListingDto, isArray: true })
  upcomingGroups(): Promise<PublicGroupListingDto[]> {
    return this.site.upcomingGroups();
  }

  @Get('events')
  @ApiOperation({
    summary:
      'Public events: UPCOMING (default, soonest first; cancelled flagged) or PAST (newest first)',
  })
  @ApiOkResponse({ type: PublicEventListDto })
  events(@Query() query: PublicEventQueryDto) {
    return this.site.events(query);
  }

  @Get('events/:id')
  @ApiOkResponse({ type: PublicEventDto })
  @ApiNotFoundResponse(HIDDEN)
  event(@Param('id', ParseUUIDPipe) id: string): Promise<PublicEventDto> {
    return this.site.event(id);
  }

  @Get('achievements')
  @ApiOperation({
    summary: 'Published achievements: newest year first, then display order',
  })
  @ApiOkResponse({ type: PublicAchievementDto, isArray: true })
  achievements(
    @Query() query: PublicAchievementQueryDto,
  ): Promise<PublicAchievementDto[]> {
    return this.site.achievements(query);
  }

  @Get('graduates')
  @ApiOperation({
    summary:
      'Published graduates with a recorded consent: name, year, message, photo only',
  })
  @ApiOkResponse({ type: PublicGraduateDto, isArray: true })
  graduates(): Promise<PublicGraduateDto[]> {
    return this.site.graduates();
  }

  @Get('administration-members')
  @ApiOperation({ summary: 'Published board members, in display order' })
  @ApiOkResponse({ type: PublicMemberDto, isArray: true })
  administrationMembers(): Promise<PublicMemberDto[]> {
    return this.site.administrationMembers();
  }

  @Get('news')
  @ApiOperation({
    summary:
      'Published news up to today (Africa/Tunis), newest first, with search and pagination',
  })
  @ApiOkResponse({ type: PublicNewsListDto })
  news(@Query() query: PublicNewsQueryDto) {
    return this.site.newsList(query);
  }

  @Get('news/:id')
  @ApiOkResponse({ type: PublicNewsDto })
  @ApiNotFoundResponse(HIDDEN)
  newsArticle(@Param('id', ParseUUIDPipe) id: string): Promise<PublicNewsDto> {
    return this.site.newsArticle(id);
  }

  @Get('gallery')
  @ApiOperation({
    summary: 'Published images in display order (category, search, pagination)',
  })
  @ApiOkResponse({ type: PublicGalleryListDto })
  gallery(@Query() query: PublicGalleryQueryDto) {
    return this.site.gallery(query);
  }
}
