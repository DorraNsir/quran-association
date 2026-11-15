/** Roles of backend/prisma/schema.prisma (enum Role). */
export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';

/** GET /api/auth/me — MeDto (backend/src/auth/dto/auth-response.dto.ts). */
export interface SessionUser {
  id: string;
  username: string;
  person: {
    id: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    email: string | null;
    phone: string | null;
  };
  roles: Role[];
  mustChangePassword: boolean;
  teacherId: string | null;
  studentId: string | null;
}

/** MobileAuthResponseDto (backend/src/auth/dto/mobile-auth.dto.ts). */
export interface MobileAuthResponse {
  accessToken: string;
  /** Access-token lifetime in seconds */
  expiresIn: number;
  /** Rotating refresh token — SecureStore only, never logged or cached */
  refreshToken: string;
  refreshExpiresAt: string;
  user: SessionUser;
}
