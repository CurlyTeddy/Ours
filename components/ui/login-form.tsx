"use client";

import { Button } from "@/components/ui/button";
import { useActionState, useId } from "react";
import { useSearchParams } from "next/navigation";
import { authenticate } from "@/lib/actions";
import Link from "next/link";
import { ArrowRight, KeyRound, User } from "lucide-react";
import ErrorMessage from "@/components/ui/error-message";

export default function LoginForm() {
  const callbackUrl = useSearchParams().get("callbackUrl") ?? "/moments";
  const [errorMessage, formAction, isPending] = useActionState(authenticate, undefined);
  const baseInputFormId = useId();

  return (
    <form action={formAction}>
      <div className="flex-1 rounded-lg bg-gray-50 px-6 pb-4 pt-8">
        <h1 className="mb-3 text-2xl">
          Please log in to continue.
        </h1>
        <div className="w-full space-y-5">
          <div>
            <label
              className="mb-3 mt-5 block text-xs font-medium text-gray-900"
              htmlFor={`${baseInputFormId}-email`}
            >
              Email
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
                id={`${baseInputFormId}-email`}
                type="email"
                name="email"
                placeholder="Enter your email"
                autoComplete="email"
                required
              />
              <User className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
            </div>
          </div>
          <div className="mt-4">
            <label
              className="mb-3 mt-5 block text-xs font-medium text-gray-900"
              htmlFor="password"
            >
              Password
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
                id="password"
                type="password"
                name="password"
                placeholder="Enter password"
                autoComplete="current-password"
                required
                minLength={8}
              />
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
            </div>
          </div>
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          <Button className="mt-4 w-full" aria-disabled={isPending}>
            Log in <ArrowRight className="ml-auto h-5 w-5 text-gray-50" />
          </Button>
          <div className="mt-6 text-sm text-gray-500 opacity-80">
            <span className="text-gray-600">Have an invite code?</span>{" "}
            <Link href={"/signup"} className="text-blue-600 underline hover:text-blue-800 transition-colors">Create an account</Link>
          </div>
        </div>
        <ErrorMessage message={errorMessage} className="mt-2" />
      </div>
    </form>
  );
}