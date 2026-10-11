-- Animated hero theme of the public home page (replaces the hero slideshow).
-- Additive: the existing site_settings row gets the default 'combo'.
-- hero_slides is kept untouched (no longer used by the public hero).

-- CreateEnum
CREATE TYPE "HeroTheme" AS ENUM ('geometric', 'aurora', 'lights', 'stars', 'letters', 'combo');

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "heroTheme" "HeroTheme" NOT NULL DEFAULT 'combo';

