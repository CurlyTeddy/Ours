import { Button } from "@/components/ui/button";
import { playpenSans } from "@/components/ui/fonts";
import { CalendarHeart, Camera, Heart, LogIn, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

function HeroSection() {
  return (
    <section className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-6 py-20">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute top-[12%] left-[8%] animate-pulse">
          <Heart className="h-4 w-4 text-primary/20" fill="currentColor" />
        </div>
        <div
          className="absolute top-[20%] right-[12%] animate-pulse"
          style={{ animationDelay: "0.5s" }}
        >
          <Heart className="h-3 w-3 text-primary/15" fill="currentColor" />
        </div>
        <div
          className="absolute bottom-[25%] left-[15%] animate-pulse"
          style={{ animationDelay: "1s" }}
        >
          <Heart className="h-5 w-5 text-primary/10" fill="currentColor" />
        </div>
        <div
          className="absolute top-[40%] right-[20%] animate-pulse"
          style={{ animationDelay: "1.5s" }}
        >
          <Heart className="h-3 w-3 text-primary/20" fill="currentColor" />
        </div>
        <div
          className="absolute bottom-[35%] right-[8%] animate-pulse"
          style={{ animationDelay: "2s" }}
        >
          <Heart className="h-4 w-4 text-primary/15" fill="currentColor" />
        </div>
        <div
          className="absolute top-[60%] left-[5%] animate-pulse"
          style={{ animationDelay: "0.8s" }}
        >
          <Heart className="h-3 w-3 text-primary/10" fill="currentColor" />
        </div>
      </div>

      <div className="relative mb-10 h-56 w-56 overflow-hidden rounded-full border-4 border-card shadow-lg md:h-72 md:w-72">
        <Image
          src="/hero.png"
          alt="Hold hands"
          fill
          className="object-cover"
          priority
        />
      </div>

      <h1 className="text-balance text-center font-serif text-5xl font-bold tracking-tight text-foreground md:text-7xl">
        Our Moments
      </h1>

      <p className="mt-4 max-w-md text-pretty text-center text-lg leading-relaxed text-muted-foreground md:text-xl">
        A little space where we keep our favorite memories, stories, and all the
        tiny moments that make us, us.
      </p>

      <div className="mt-8 flex items-center gap-3" aria-hidden="true">
        <span className="h-px w-12 bg-border" />
        <Heart className="h-4 w-4 text-primary/40" fill="currentColor" />
        <span className="h-px w-12 bg-border" />
      </div>

      <Button
        size="lg"
        className="mt-8 gap-2 rounded-full px-8 text-base shadow-md transition-shadow hover:shadow-lg"
        asChild
      >
        <Link href="/login">
          <LogIn className="h-4 w-4" />
          Login to Our Space
        </Link>
      </Button>
      <p className="mt-3 text-xs text-muted-foreground/60">
        Only accessible to the two of us
      </p>
    </section>
  );
}

function LoveStats() {
  const stats = [
    {
      icon: CalendarHeart,
      value: "365+",
      label: "Days Together",
    },
    {
      icon: Camera,
      value: "200+",
      label: "Photos Captured",
    },
    {
      icon: MapPin,
      value: "12",
      label: "Places Explored",
    },
    {
      icon: Heart,
      value: "\u221E",
      label: "Moments Cherished",
    },
  ];

  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 shadow-sm md:p-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center text-center"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="font-serif text-2xl font-bold text-foreground md:text-3xl">
                {stat.value}
              </span>
              <span className="mt-1 text-sm text-muted-foreground">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border px-6 py-8">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Made with</span>
          <Heart className="h-3.5 w-3.5 text-primary" fill="currentColor" />
          <span>for us</span>
        </div>
        <p className={`text-xs ${playpenSans.className}`}>
          Our Moments &middot; A private love diary
        </p>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <HeroSection />
      <LoveStats />
      <Footer />
    </main>
  );
}
