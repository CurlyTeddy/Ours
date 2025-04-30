import SignupForm from "@/components/ui/signup-form";

export default function Page() {
  return (
    <main className="flex items-center justify-center md:h-screen">
      <div className="relative mx-auto flex w-full max-w-[400px] flex-col p-4 md:-mt-32">
        <SignupForm />
      </div>
    </main>
  )
}