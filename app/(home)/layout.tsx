import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { PowerIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { DarkModeSwitch } from "@/components/ui/switch";
import Link from "next/link";
import UserAvatar from "@/features/profile/components/user-avatar";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center m-3 space-x-3">
        <div className="flex flex-1 justify-center">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink href={"/moments"}>
                  Moments
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink href={"/twodo"}>Two Do</NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex space-x-2">
          <DarkModeSwitch />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="p-0 rounded-full hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <UserAvatar />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuItem asChild className="p-0">
              <Button
                type="button"
                variant={"ghost"}
                className="w-full justify-start cursor-pointer"
                asChild
              >
                <Link href="/profile">
                  <UserIcon className="w-6" />
                  Profile
                </Link>
              </Button>
            </DropdownMenuItem>
            <form action={signOutAction}>
              <DropdownMenuItem asChild className="p-0">
                <Button
                  type="submit"
                  variant={"ghost"}
                  className="w-full justify-start cursor-pointer"
                >
                  <PowerIcon className="w-6" />
                  Sign Out
                </Button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}
    </div>
  );
}
