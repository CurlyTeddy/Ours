"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sections = [
  { href: "/moments", label: "Moments" },
  { href: "/twodo", label: "Two Do" },
  { href: "/map", label: "Map" },
];

function SectionNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="flex gap-0.5 rounded-full border border-us-line bg-us-surface p-0.75 shadow-[0_6px_18px_-12px_rgba(31,43,66,.35)] sm:gap-1 sm:p-1"
    >
      {sections.map(({ href, label }) => {
        // Nested routes still belong to their section.
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex h-9.5 touch-manipulation items-center justify-center rounded-full px-3 text-[13px] font-extrabold whitespace-nowrap transition-colors duration-450 select-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8] sm:h-10 sm:px-5 sm:text-sm",
              current
                ? "bg-us-seg text-us-seg-ink"
                : "text-us-muted hover:text-us-ink",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export { SectionNav };
