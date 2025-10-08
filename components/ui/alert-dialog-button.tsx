import { useTransition, ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { HTTPError } from "ky";
import { HttpErrorPayload } from "@/lib/error";
import { toast } from "sonner";

interface AlertDialogButtonProps {
  children: ReactNode;
  buttonVariant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  buttonSize?: "default" | "sm" | "lg" | "icon";
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

  onConfirm: () => void | Promise<void>;
  onOpen?: () => void | Promise<void>;
  onClose?: () => void | Promise<void>;
  defaultErrorMessage?: string;
}

export default function AlertDialogButton({
  children,
  buttonVariant = "default",
  buttonSize = "default",
  buttonClassName = "cursor-pointer",
  disabled = false,
  alertTitle,
  alertDescription,
  confirmButtonText = "Confirm",
  confirmButtonVariant = "destructive",
  cancelButtonText = "Cancel",
  onConfirm,
  onOpen,
  onClose,
  defaultErrorMessage = "An error occurred. Please try again later.",
}: AlertDialogButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await onConfirm();
      } catch (error) {
        let errorMessage = defaultErrorMessage;
        if (error instanceof HTTPError) {
          const errorPayload = await error.response.json<HttpErrorPayload>();
          errorMessage = errorPayload.message;
        }
        toast.error(errorMessage);
      }
    });
  };

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (open && onOpen !== undefined) {
          Promise.resolve(onOpen()).catch((reason: unknown) => {
            console.error(reason);
          });
        } else if (!open && onClose !== undefined) {
          Promise.resolve(onClose()).catch((reason: unknown) => {
            console.error(reason);
          });
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
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
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" className="cursor-pointer">
              {cancelButtonText}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild variant={confirmButtonVariant}>
            <Button
              onClick={handleConfirm}
              className="cursor-pointer"
              disabled={isPending}
            >
              {confirmButtonText}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
