"use client";

import { User } from "next-auth";
import React, { createContext, useContext } from "react";

interface ExtendedUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

const UserContext = createContext<ExtendedUser>({
  id: "",
  name: "",
  email: "",
  image: null,
});

export function UserProvider({
  user,
  children,
}: {
  user: User | undefined;
  children: React.ReactNode;
}) {
  if (!user?.id || !user.name || !user.email || user.image === undefined) {
    throw new Error("User is not authenticated");
  }

  const extendedUser: ExtendedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };

  return (
    <UserContext.Provider value={extendedUser}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
