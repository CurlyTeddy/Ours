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
      router.replace("/login");
    }
  }, [user, router]);

  return (
    <Avatar className="cursor-pointer">
      <AvatarImage
        src={user?.imageUrl ? user.imageUrl : undefined}
        alt="My account"
      />
      <AvatarFallback className="font-semibold bg-gradient-to-br from-primary/10 to-primary/20 text-primary">
        {user?.name && user.name.length > 0 ? user.name[0].toUpperCase() : "U"}
      </AvatarFallback>
    </Avatar>
  );
}
