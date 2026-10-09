import type { Test } from 'supertest';

/**
 * Rooms are chosen per weekly slot / per session (no class-level room).
 * Most suites still think of "the room a class uses": this keeps it on the
 * test side. A class created with `roomId` has it stripped from the request
 * and remembered; weekly slots and ad-hoc sessions of that class created
 * without a `roomId` get it. An explicit `roomId` always wins.
 */
export function classRooms() {
  const rooms = new Map<string, string>();
  const classOf = (path: string, body: Record<string, unknown>) => {
    const slot = /group-classes\/([0-9a-f-]{36})\/schedules$/.exec(path);
    if (slot) return slot[1];
    if (/(^|\/)sessions$/.test(path) && typeof body.groupClassId === 'string')
      return body.groupClassId;
    return undefined;
  };
  return {
    rooms,
    /** POST body + follow-up (remember the room of a class being created). */
    post(path: string, body: object, send: (body: object) => Test): Test {
      const b = { ...(body as Record<string, unknown>) };
      if (/(^|\/)group-classes$/.test(path) && typeof b.roomId === 'string') {
        const roomId = b.roomId;
        delete b.roomId;
        return send(b).on(
          'response',
          (res: { status: number; body: { id?: string } }) => {
            if (res.status === 201 && res.body.id)
              rooms.set(res.body.id, roomId);
          },
        );
      }
      const classId = classOf(path, b);
      if (classId && b.roomId === undefined && rooms.has(classId))
        b.roomId = rooms.get(classId);
      return send(b);
    },
  };
}
