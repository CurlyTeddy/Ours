import Link from "next/link";

export default function Home() {
  return (
    <div className="relative min-h-screen">
      <Link
        href="/login"
        className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-400 md:text-base"
      >
        <span>Log in</span>
      </Link>
    </div>
  );
}
