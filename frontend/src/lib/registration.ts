import { ageOn } from "@/lib/domain"
import type { ISODate, RegistrationRequest } from "@/types/domain"

/** Applicant age: from the birth date when given, otherwise the declared age. */
export function requestAge(request: Pick<RegistrationRequest, "birthDate" | "age">, today: ISODate) {
  return request.birthDate ? ageOn(request.birthDate, today) : request.age
}

/** Only a pending request that never produced a student can be admitted or refused. */
export const canReviewRequest = (request: RegistrationRequest) => request.status === "PENDING" && !request.createdStudentId

export type RegistrationFields = Pick<
  RegistrationRequest,
  | "firstName"
  | "lastName"
  | "birthDate"
  | "age"
  | "phone"
  | "hasStudiedQuranBefore"
  | "previousExperience"
  | "notes"
  | "interestedGroupId"
  | "interestedProgramLabel"
>
