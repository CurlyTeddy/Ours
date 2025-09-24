"use client";

import { useActionState, useId } from "react";
import { register } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { AtSign, KeyRound, Mail, User, UserPlus } from "lucide-react";
import ErrorMessage from "@/components/ui/error-message";

export default function SignupForm() {
  const initialState = { errors: undefined, message: undefined };
  const [state, formAction, isPending] = useActionState(register, initialState);
  const baseInputFormId = useId();

  return (
    <form action={formAction}>
      <Card className="flex-1 p-8">
        <h1 className="mb-8 text-2xl font-semibold text-foreground">
          Welcome to our secret base! Please sign up to continue.
        </h1>
        <div className="w-full space-y-8">
          <div className="space-y-3">
            <Label htmlFor={`${baseInputFormId}-username`}>
              <User className="h-4 w-4" />
              Username
            </Label>
            <Input
              id={`${baseInputFormId}-username`}
              type="text"
              name="username"
              placeholder="At least 6 letters or numbers. e.g. ruru123"
              autoComplete="username"
              minLength={6}
              required
              aria-describedby={`${baseInputFormId}-username-error`}
              className="h-11 px-4 py-3"
            />
            <div
              id={`${baseInputFormId}-username-error`}
              aria-live="polite"
              aria-atomic="true"
            >
              {state.errors?.properties?.username?.errors.map((error) => (
                <p className="mt-2 text-sm text-destructive" key={error}>
                  {error}
                </p>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Label htmlFor={`${baseInputFormId}-email`}>
              <AtSign className="h-4 w-4" />
              Email
            </Label>
            <Input
              id={`${baseInputFormId}-email`}
              type="email"
              name="email"
              placeholder="e.g. ruru@gmail.com"
              autoComplete="email"
              required
              aria-describedby={`${baseInputFormId}-email-error`}
              className="h-11 px-4 py-3"
            />
            <div
              id={`${baseInputFormId}-email-error`}
              aria-live="polite"
              aria-atomic="true"
            >
              {state.errors?.properties?.email?.errors.map((error) => (
                <p className="mt-2 text-sm text-destructive" key={error}>
                  {error}
                </p>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Label htmlFor={`${baseInputFormId}-password`}>
              <KeyRound className="h-4 w-4" />
              Password
            </Label>
            <Input
              id={`${baseInputFormId}-password`}
              type="password"
              name="password"
              placeholder="At least 8 characters. e.g. 5/4u83bj6"
              autoComplete="current-password"
              required
              minLength={8}
              aria-describedby={`${baseInputFormId}-password-error`}
              className="h-11 px-4 py-3"
            />
            <div
              id={`${baseInputFormId}-password-error`}
              aria-live="polite"
              aria-atomic="true"
            >
              {state.errors?.properties?.password?.errors.map((error) => (
                <p className="mt-2 text-sm text-destructive" key={error}>
                  {error}
                </p>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Label htmlFor={`${baseInputFormId}-invite-code`}>
              <Mail className="h-4 w-4" />
              Invite Code
            </Label>
            <Input
              id={`${baseInputFormId}-invite-code`}
              type="text"
              name="inviteCode"
              placeholder="Enter invite code"
              required
              className="h-11 px-4 py-3"
            />
          </div>
          <Button className="w-full h-11 mt-2" aria-disabled={isPending}>
            Sign up <UserPlus className="ml-auto h-5 w-5" />
          </Button>
        </div>
        <ErrorMessage message={state.message} className="mt-6" />
      </Card>
    </form>
  );
}
