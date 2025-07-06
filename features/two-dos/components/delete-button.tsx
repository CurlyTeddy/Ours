import { Table } from "@tanstack/react-table";
import { useState, useTransition } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import ErrorMessage from "@/components/ui/error-message";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";
import ky, { HTTPError } from "ky";
import { HttpErrorPayload } from "@/lib/error";
import { Todo } from "@/features/two-dos/models/views";

export default function DeleteButton({ table } : { table: Table<Todo> }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const { key, mutate } = useTodos();

  const onDelete = () => {
    const selectTodoIds = table.getSelectedRowModel().rows.map((row) => row.original.id);

    startTransition(async () => {
      try {
        await mutate(async (todos = []) => {
          await Promise.all(selectTodoIds.map(id => ky.delete(`${key}/${id}`)));
          table.resetRowSelection();
          const removeSet = new Set(selectTodoIds);
          return todos.filter((todo) => !(todo.id in removeSet));
        });
        setOpen(false);
        setErrorMessage(undefined);
      } catch (error) {
        let errorMessage = "Failed to delete todo. Please try again later.";
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