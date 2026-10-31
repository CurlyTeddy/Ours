"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/features/profile/hooks/user";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UserAvatar() {
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user === null) {
      router.replace("/");
    }
  }, [user, router]);

  return (
    <Avatar className="size-9 cursor-pointer sm:size-10">
      <AvatarImage
        src={user?.imageUrl ? user.imageUrl : undefined}
        alt="My account"
      />
      <AvatarFallback className="bg-[#4F70A8] text-sm font-black text-white sm:text-[15px]">
        {user?.name && user.name.length > 0 ? user.name[0].toUpperCase() : "U"}
      </AvatarFallback>
    </Avatar>
  );
}
