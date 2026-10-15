import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { ProfileDto, UpdateProfileDto } from './dto/profile.dto.js';

/** Calendar dates (DATE columns) as "YYYY-MM-DD". */
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Own profile: reads/writes the canonical Person of the signed-in user —
 * so a change shows up everywhere that person appears (account, teacher,
 * student). Only contact fields are writable here.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<ProfileDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        username: true,
        mustChangePassword: true,
        lastLoginAt: true,
        roles: { select: { role: true }, orderBy: { role: 'asc' } },
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            gender: true,
            dateOfBirth: true,
            photoUrl: true,
            phone: true,
            email: true,
            address: true,
            teacher: {
              select: {
                id: true,
                status: true,
                joinedAt: true,
                qualification: true,
              },
            },
            student: {
              select: { id: true, status: true, registrationDate: true },
            },
          },
        },
      },
    });
    const { teacher, student, dateOfBirth, ...person } = user.person;
    return {
      person: {
        ...person,
        dateOfBirth: dateOfBirth ? isoDate(dateOfBirth) : null,
      },
      account: {
        username: user.username,
        roles: user.roles.map((r) => r.role),
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt,
      },
      teacher: teacher
        ? { ...teacher, joinedAt: isoDate(teacher.joinedAt) }
        : null,
      student: student
        ? { ...student, registrationDate: isoDate(student.registrationDate) }
        : null,
    };
  }

  async update(userId: string, dto: UpdateProfileDto): Promise<ProfileDto> {
    // Explicit field list: no mass assignment even if the DTO grows later
    const { phone, email, address } = dto;
    const data = Object.fromEntries(
      Object.entries({ phone, email, address }).filter(
        ([, value]) => value !== undefined,
      ),
    );
    if (Object.keys(data).length > 0) {
      const { personId } = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { personId: true },
      });
      await this.prisma.person.update({ where: { id: personId }, data });
    }
    return this.get(userId);
  }
}
