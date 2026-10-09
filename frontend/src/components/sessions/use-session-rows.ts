/**
 * Session rows now come from the API (lib/api/sessions): group, branch,
 * room, the session's team snapshot and its attendance progress are all
 * part of the session DTO. Kept as the import path the screens use.
 */
export { toSessionRow, type SessionRow, type TeamMember } from "@/lib/api/sessions"
