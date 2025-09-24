"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Suspense, useActionState, useId } from "react";
import { authenticate } from "@/features/auth/actions";
import Link from "next/link";
import { ArrowRight, KeyRound, User } from "lucide-react";
import ErrorMessage from "@/components/ui/error-message";
import { useSearchParams } from "next/navigation";

function RedirectInput() {
  const callbackUrl = useSearchParams().get("callbackUrl") ?? "/moments";

  return <input type="hidden" name="redirectTo" value={callbackUrl} />;
}

export default function LoginForm() {
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );
  const baseInputFormId = useId();

  return (
    <form action={formAction}>
      <Card className="flex-1 p-8">
        <h1 className="mb-8 text-2xl font-semibold text-foreground">
          Please log in to continue.
        </h1>
        <div className="w-full space-y-8">
          <div className="space-y-3">
            <Label htmlFor={`${baseInputFormId}-email`}>
              <User className="h-4 w-4" />
              Email
            </Label>
            <Input
              id={`${baseInputFormId}-email`}
              type="email"
              name="email"
              placeholder="Enter your email"
              autoComplete="email"
              required
              className="h-11 px-4 py-3"
            />
          </div>
          <div className="space-y-3">
            <Label htmlFor="password">
              <KeyRound className="h-4 w-4" />
              Password
            </Label>
            <Input
              id="password"
              type="password"
              name="password"
              placeholder="Enter password"
              autoComplete="current-password"
              required
              minLength={8}
              className="h-11 px-4 py-3"
            />
          </div>
          <Suspense>
            <RedirectInput />
          </Suspense>
          <Button className="w-full h-11 mt-2" aria-disabled={isPending}>
            Log in <ArrowRight className="ml-auto h-5 w-5" />
          </Button>
          <div className="text-center text-sm text-muted-foreground pt-2">
            <span>Have an invite code?</span>{" "}
            <Link
              href={"/signup"}
              className="text-primary underline hover:text-primary/80 transition-colors"
            >
              Create an account
            </Link>
          </div>
        </div>
        <ErrorMessage message={errorMessage} className="mt-6" />
      </Card>
    </form>
  );
}
