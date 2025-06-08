import { cn } from "@/lib/utils";
import { CircleAlert } from "lucide-react";

export default function ErrorMessage({ message, className }: { message: string | undefined } & { className?: string }) {
  return (
    <div className={cn("flex items-end space-x-1", className)} aria-live="polite" aria-atomic="true">
      {message && (
        <div className="flex items-center space-x-1">
          <CircleAlert className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-500">{message}</p>
        </div>
      )}
    </div>
  );
}