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
import { getErrorMessage } from "@/lib/error";
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
  buttonAriaLabel?: string;
  disabled?: boolean;

  alertTitle: string;
  alertDescription: string;
  confirmButtonText?: string;

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
  buttonAriaLabel,
  disabled = false,
  alertTitle,
  alertDescription,
  confirmButtonText = "Confirm",
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
        toast.error(await getErrorMessage(error, defaultErrorMessage));
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
          aria-label={buttonAriaLabel}
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
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild variant="destructive">
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
