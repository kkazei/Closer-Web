import type { MembershipDTO, ProfileDTO } from "@/data";

export type AuthenticatedUser = {
  userId: string;
  email?: string;
  profile: ProfileDTO | null;
  memberships: MembershipDTO[];
};
