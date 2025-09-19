import { useState, useTransition, ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import ErrorMessage from "@/components/ui/error-message";
import { HTTPError } from "ky";
import { HttpErrorPayload } from "@/lib/error";

interface AlertDialogButtonProps {
  children: ReactNode;
  buttonVariant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  buttonClassName?: string;
  disabled?: boolean;

  alertTitle: string;
  alertDescription: string;
  confirmButtonText?: string;
  confirmButtonVariant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  cancelButtonText?: string;

  onConfirm: () => Promise<void>;
  defaultErrorMessage?: string;
}

export default function AlertDialogButton({
  children,
  buttonVariant = "default",
  buttonClassName = "cursor-pointer",
  disabled = false,
  alertTitle,
  alertDescription,
  confirmButtonText = "Confirm",
  confirmButtonVariant = "destructive",
  cancelButtonText = "Cancel",
  onConfirm,
  defaultErrorMessage = "An error occurred. Please try again later.",
}: AlertDialogButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await onConfirm();
        setOpen(false);
        setErrorMessage(undefined);
      } catch (error) {
        let errorMessage = defaultErrorMessage;
        if (error instanceof HTTPError) {
          const errorPayload = await error.response.json<HttpErrorPayload>();
          errorMessage = errorPayload.message;
        }

        setErrorMessage(errorMessage);
      }
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setErrorMessage(undefined);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          onClick={() => {
            setOpen(true);
          }}
          variant={buttonVariant}
          className={buttonClassName}
          disabled={disabled}
        >
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{alertTitle}</AlertDialogTitle>
          <AlertDialogDescription>{alertDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorMessage message={errorMessage} />
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" className="cursor-pointer">
              {cancelButtonText}
            </Button>
          </AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            variant={confirmButtonVariant}
            className="cursor-pointer"
            disabled={isPending}
          >
            {confirmButtonText}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
