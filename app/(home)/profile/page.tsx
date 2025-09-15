import { validateSessionToken } from "@/features/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ProfileCard from "@/features/profile/components/profile-card";

export default async function Page() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;

  const { session, user } = await validateSessionToken(sessionToken);

  if (!session || !user) {
    redirect("/login");
  }

  const userData = {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };

  return <ProfileCard user={userData} />;
}
