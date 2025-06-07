import { RowSelectionState } from "@tanstack/react-table";
import { useEffect, useState, useTransition } from "react";
import { deleteTodos } from "@/app/(home)/twodo/repository";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import ErrorMessage from "@/components/ui/error-message";

export default function DeleteButton({ rowSelection } : { rowSelection: RowSelectionState }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (isPending || errorMessage !== undefined) {
      return;
    }
    setOpen(false);
  }, [isPending, errorMessage]);

  const onDelete = () => {
    const selectTodoIds = Object.keys(rowSelection);
    if (selectTodoIds.length === 0) {
      setOpen(false);
      return;
    }

    startTransition(async () => {
      const message = await deleteTodos(selectTodoIds);
      setErrorMessage(message);
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
        <Button onClick={() => { setOpen(true); }} className="cursor-pointer">Delete To-dos</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action will delete the selected to-dos and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorMessage message={errorMessage} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={onDelete} variant={"destructive"} className="cursor-pointer" disabled={isPending}>Delete</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}