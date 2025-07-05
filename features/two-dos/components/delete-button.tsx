import { RowSelectionState } from "@tanstack/react-table";
import { useState, useTransition } from "react";
import { deleteTodos } from "@/features/two-dos/repository";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import ErrorMessage from "@/components/ui/error-message";

export default function DeleteButton({ rowSelection } : { rowSelection: RowSelectionState }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const onDelete = () => {
    const selectTodoIds = Object.keys(rowSelection);

    startTransition(async () => {
      if (selectTodoIds.length !== 0) {
        const message = await deleteTodos(selectTodoIds);
        setErrorMessage(message);
      }
      setOpen(false);
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
          <AlertDialogCancel asChild>
            <Button variant="outline" className="cursor-pointer">Cancel</Button>
          </AlertDialogCancel>
          <Button onClick={onDelete} variant={"destructive"} className="cursor-pointer" disabled={isPending}>Delete</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}