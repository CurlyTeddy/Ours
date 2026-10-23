"use client";

import { useActionState, useId, useState } from "react";
import { Heart, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { corben, gaegu } from "@/components/ui/storybook-fonts";
import { nunito } from "@/components/ui/fonts";
import { authenticate } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

const emptyFields = "Enter both your email and your password.";
const field =
  "grid gap-1.5 font-(family-name:--f-ui) text-xs leading-none font-bold tracking-[.12em] text-[#6d6156] uppercase";
const input =
  "rounded-[10px] border-[1.5px] border-[#d8cdbd] bg-[#fffdf8] px-3.5 py-3 font-(family-name:--f-ui) text-base leading-[1.2] font-normal tracking-normal text-[#3a2f2a] normal-case focus:border-[#2f4468] focus:shadow-[0_0_0_3px_rgba(47,68,104,.18)] focus:outline-none";
const button =
  "min-h-11 flex-auto cursor-pointer touch-manipulation rounded-full px-5 py-3 font-(family-name:--f-ui) text-[13px] leading-none font-bold tracking-[.16em] uppercase select-none transition-[transform,background-color] duration-250 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2f4468] active:scale-97 disabled:cursor-default disabled:opacity-70 motion-reduce:transition-none";

/* Lives inside the dialog content, so closing the dialog clears the form and its status line. */
function LoginCard() {
  const [message, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );
  const [emptyError, setEmptyError] = useState(false);
  const id = useId();

  function checkFields(e: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(e.currentTarget);
    const filled =
      String(data.get("email")).trim() !== "" && data.get("password") !== "";
    // A prevented submit never reaches the form action, so authenticate is not called.
    if (!filled) e.preventDefault();
    setEmptyError(!filled);
  }

  return (
    <form
      action={formAction}
      onSubmit={checkFields}
      noValidate
      className="relative grid gap-3.5 px-7 pt-8 pb-6 before:absolute before:inset-x-0 before:top-0 before:h-2 before:bg-[#2f4468]"
    >
      <DialogTitle className="font-(family-name:--f-display) text-[28px] leading-[1.1] font-normal text-[#22364f]">
        Welcome home
      </DialogTitle>
      <DialogDescription className="-mt-1.5 mb-1 font-(family-name:--f-hand) text-[19px] leading-[1.2] text-[#6d6156]">
        The rest of our little world is behind this page.
      </DialogDescription>
      <label htmlFor={`${id}-email`} className={field}>
        Email
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="username"
          className={input}
        />
      </label>
      <label htmlFor={`${id}-password`} className={field}>
        Password
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          className={input}
        />
      </label>
      <input type="hidden" name="redirectTo" value="/moments" />
      <p
        role="status"
        aria-live="polite"
        className="min-h-[1.2em] font-(family-name:--f-ui) text-sm leading-[1.45] font-semibold text-[#7a3b44]"
      >
        {isPending ? null : emptyError ? emptyFields : message}
      </p>
      <div className="mt-1 flex flex-wrap gap-2.5">
        <DialogClose
          className={cn(
            button,
            "border border-[#d8cdbd] bg-transparent text-[#6d6156]",
          )}
        >
          Back to the book
        </DialogClose>
        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className={cn(
            button,
            "inline-flex items-center justify-center gap-2 border border-[#22364f] bg-[#2f4468] text-[#f6efe2] hover:bg-[#22364f]",
          )}
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          Log in
        </button>
      </div>
    </form>
  );
}

export default function StorybookLoginDialog() {
  return (
    <Dialog>
      <DialogTrigger className="pointer-events-auto relative inline-flex cursor-pointer touch-manipulation items-center gap-2.5 overflow-hidden rounded-full border border-[#22364f] bg-[#2f4468] px-10 py-4 font-(family-name:--f-ui) text-sm leading-none font-bold tracking-[.2em] text-[#f6efe2] uppercase shadow-[0_14px_30px_-14px_rgba(25,40,65,.65)] select-none transition-[transform,background-color,box-shadow] duration-400 ease-[cubic-bezier(.2,.8,.2,1)] after:absolute after:inset-0 after:-translate-x-[120%] after:bg-[linear-gradient(105deg,rgba(255,255,255,0)_30%,rgba(255,255,255,.35)_50%,rgba(255,255,255,0)_70%)] after:transition-transform after:duration-900 after:ease-in-out hover:-translate-y-0.5 hover:bg-[#22364f] hover:shadow-[0_18px_36px_-14px_rgba(25,40,65,.75)] hover:after:translate-x-[120%] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#22364f] active:translate-y-0 active:scale-97 active:duration-120 motion-reduce:transition-none motion-reduce:after:transition-none">
        <Heart aria-hidden="true" className="size-[15px]" strokeWidth={1.8} />
        Log in
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className={cn(
          corben.variable,
          gaegu.variable,
          nunito.variable,
          "w-[min(410px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden rounded-[18px] border-0 bg-[#f6efe2] p-0 text-[#3a2f2a] shadow-[0_30px_80px_rgba(20,30,45,.45)] sm:max-w-none",
        )}
      >
        <LoginCard />
      </DialogContent>
    </Dialog>
  );
}
