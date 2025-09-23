import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="h-screen w-screen relative overflow-hidden">
      <Image
        src="/home_background.png"
        alt="Background"
        fill
        className="object-fill"
        priority
        sizes="100vw"
      />

      <main className="relative h-full w-full flex items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-white dark:bg-gray-900 border-4 border-black dark:border-white rounded-xl shadow-2xl p-8 z-10">
          <div className="absolute -top-4 -left-4 px-2 py-1 bg-black text-white text-xs font-bold rounded-tl-lg">
            LVL 25
          </div>
          <div className="absolute -top-4 -right-4 px-2 py-1 bg-black text-white text-xs font-bold rounded-tr-lg">
            BIRTHDAY QUEST
          </div>
          <div className="absolute -bottom-4 -left-4 w-8 h-8 bg-black dark:bg-white rounded-bl-lg"></div>
          <div className="absolute -bottom-4 -right-4 w-8 h-8 bg-black dark:bg-white rounded-br-lg"></div>

          <div className="w-full aspect-square mb-6 rounded-lg overflow-hidden border-4 border-black dark:border-white">
            <Image
              alt="Happy Birthday"
              className="w-full h-full object-cover"
              src="/selfie.png"
              width={300}
              height={300}
              loading="eager"
            />
          </div>

          <div className="text-center space-y-4">
            <h1 className="text-xl md:text-2xl font-bold text-black dark:text-white">
              Teddy&apos;s and Ruru&apos;s secret place
            </h1>
            <p className="text-black/70 dark:text-white/70 text-sm md:text-base">
              A place to plan our next advanture!
            </p>

            <div className="pt-4">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/login" className="font-medium">
                  Login
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
