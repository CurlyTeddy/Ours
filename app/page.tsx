import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <div className="relative min-h-screen">
      <Button asChild size={"lg"}>
        <Link
          href="/login"
          className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-lg px-6 py-3 font-medium transition-colors md:text-base"
        >
          <span>Log in</span>
        </Link>
      </Button>
    </div>
  );
}
