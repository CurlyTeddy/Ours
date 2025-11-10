"use client";

import {
  ProfileSkeleton,
  ProfileCard,
} from "@/features/profile/components/profile-card";
import { useUser } from "@/features/profile/hooks/user";

export default function Page() {
  const { user, isLoading } = useUser();
  if (user === undefined && isLoading) {
    return <ProfileSkeleton />;
  }

  if (user === undefined || user === null) {
    throw Error("Code execution should not reach here");
  }

  return <ProfileCard user={user} />;
}
