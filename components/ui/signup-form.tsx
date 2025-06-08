"use client";

import { useActionState, useId } from "react";
import { register } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { AtSign, KeyRound, Mail, User, UserPlus } from "lucide-react";
import ErrorMessage from "@/components/ui/error-message";

export default function SignupForm() {
  const initialState = { errors: {}, message: undefined };
  const [state, formAction, isPending] = useActionState(register, initialState);
  const baseInputFormId = useId();

  return (
    <form action={formAction}>
      <div className="flex-1 rounded-lg bg-gray-50 px-6 pb-4 pt-8">
        <h1 className="mb-3 text-2xl">
          Welcome to our secret base! Please sign up to continue.
        </h1>
        <div className="w-full space-y-5">
          <div>
            <label
              className="mb-3 mt-5 block text-xs font-medium text-gray-900"
              htmlFor={`${baseInputFormId}-username`}
            >
              Username
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
                id={`${baseInputFormId}-username`}
                type="text"
                name="username"
                placeholder="At least 6 letters or numbers. e.g. ruru123"
                autoComplete="username"
                minLength={6}
                required
                aria-describedby={`${baseInputFormId}-username-error`}
              />
              <User className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
            </div>
            <div id={`${baseInputFormId}-username-error`} aria-live="polite" aria-atomic="true">
              {state.errors?.username?.map((error) => (
                <p className="mt-2 text-sm text-red-500" key={error}>
                  {error}
                </p>
              ))}
            </div>
          </div>
          <div className="mt-4">
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
                placeholder="e.g. ruru@gmail.com"
                autoComplete="email"
                required
                aria-describedby={`${baseInputFormId}-email-error`}
              />
              <AtSign className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
            </div>
            <div id={`${baseInputFormId}-email-error`} aria-live="polite" aria-atomic="true">
              {state.errors?.email?.map((error) => (
                <p className="mt-2 text-sm text-red-500" key={error}>
                  {error}
                </p>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label
              className="mb-3 mt-5 block text-xs font-medium text-gray-900"
              htmlFor={`${baseInputFormId}-password`}
            >
              Password
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
                id={`${baseInputFormId}-password`}
                type="password"
                name="password"
                placeholder="At least 8 characters. e.g. 5/4u83bj6"
                autoComplete="current-password"
                required
                minLength={8}
                aria-describedby={`${baseInputFormId}-password-error`}
              />
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
            </div>
            <div id={`${baseInputFormId}-password-error`} aria-live="polite" aria-atomic="true">
              {state.errors?.password?.map((error) => (
                <p className="mt-2 text-sm text-red-500" key={error}>
                  {error}
                </p>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label
              className="mb-3 mt-5 block text-xs font-medium text-gray-900"
              htmlFor={`${baseInputFormId}-invite-code`}
            >
              Invite Code
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
                id={`${baseInputFormId}-invite-code`}
                type="text"
                name="inviteCode"
                placeholder="Enter invite code"
                required
              />
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
            </div>
          </div>
          <Button className="mt-4 w-full" aria-disabled={isPending}>
            Sign up <UserPlus className="ml-auto h-5 w-5 text-gray-50" />
          </Button>
        </div>
        <ErrorMessage message={state.message} className="mt-2" />
      </div>
    </form>
  );
}