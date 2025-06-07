import { CircleAlert } from "lucide-react";

export default function ErrorMessage({ message }: { message: string | undefined }) {
  return (
    <div className="flex items-end space-x-1" aria-live="polite" aria-atomic="true">
      {message && (
        <div className="flex items-center space-x-1">
          <CircleAlert className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-500">{message}</p>
        </div>
      )}
    </div>
  );
}