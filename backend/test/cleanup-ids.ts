/**
 * Bulk-write filters on ONE fixture id. When setup failed before creating it
 * (the id is undefined), the filter matches NOTHING — Prisma drops
 * `{ field: undefined }`, which would turn deleteMany / updateMany into an
 * operation on EVERY row of the table.
 */
export const oneOf = (id: string | undefined) => ({ in: id ? [id] : [] });

/** `where: onlyId(id.year)` — that row, or none. */
export const onlyId = (id: string | undefined) => ({ id: oneOf(id) });
