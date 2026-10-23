import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PowerIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SectionNav } from "@/components/section-nav";
import { caveat, homemadeApple, nunito } from "@/components/ui/fonts";
import { cn } from "@/lib/utils";
import Link from "next/link";
import UserAvatar from "@/features/profile/components/user-avatar";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={cn(
        "flex h-dvh flex-col",
        nunito.variable,
        caveat.variable,
        homemadeApple.variable,
      )}
    >
      <header className="us-palette relative z-10 flex h-16 flex-none items-center justify-between gap-2.5 bg-us-page px-4 font-ui text-us-ink sm:grid sm:h-auto sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:px-8 sm:py-3.5">
        <div className="sm:col-start-2">
          <SectionNav />
        </div>
        <div className="flex items-center gap-2.5 sm:justify-self-end">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="size-auto rounded-full p-0 hover:bg-transparent focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#4F70A8]"
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
      </header>
      {children}
    </div>
  );
}
