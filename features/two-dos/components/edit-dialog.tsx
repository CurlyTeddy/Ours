import { timeFormat, Todo } from "@/features/two-dos/models/views";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { updateSchema } from "@/features/two-dos/models/views";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTimeZone } from "@/components/providers/time-zone";
import { DateTime } from "luxon";
import { useState, useTransition } from "react";
import { Form, FormItem, FormLabel, FormMessage, UncontrolledFormField, RegisteredFormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import ErrorMessage from "@/components/ui/error-message";
import PopoverCalendar, { dateFormat } from "@/components/ui/popover-calendar";
import ky, { HTTPError } from "ky";
import { TodoUpdateResponse } from "@/features/two-dos/models/responses";
import { HttpErrorPayload } from "@/lib/error";
import { TodoUpdateRequest } from "@/features/two-dos/models/requests";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";

export default function EditDialog({
  todo,
  setEditingTodo,
}: {
  todo: Todo;
  setEditingTodo: (editingTodo: Todo | null) => void;
}) {
  const timeZone = useTimeZone();
  const form = useForm<z.infer<typeof updateSchema>>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      title: todo.title,
      description: todo.description ?? "",
      doneAt: todo.doneAt ? DateTime.fromISO(todo.doneAt, { zone: timeZone }).toFormat(dateFormat) : null,
    },
  });

  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const { key, mutate } = useTodos();

  const onSubmit = (data: z.infer<typeof updateSchema>) => {
    startTransition(async () => {
      try {
        await mutate(async (todos = []) => {
          const { todo: updatedTodo } = await ky.put(`${key}/${todo.id}`, {
            json: {
              title: data.title,
              description: data.description ?? null,
              doneAt: !data.doneAt || data.doneAt.length === 0 ? null : DateTime.fromFormat(data.doneAt, dateFormat, { zone: timeZone }).toISO(),
            } satisfies TodoUpdateRequest,
          }).json<TodoUpdateResponse>();

          return todos.map((todo) => todo.id === updatedTodo.id ? {
            ...todo,
            title: updatedTodo.title,
            description: updatedTodo.description,
            doneAt: updatedTodo.doneAt,
            updatedAt: updatedTodo.updatedAt,
          } : todo);
        });

        setErrorMessage(undefined);
        setEditingTodo(null);
      } catch (error) {
        let errorMessage = "Failed to update todo. Please try again later.";
        if (error instanceof HTTPError) {
          const errorPayload = await error.response.json<HttpErrorPayload>();
          errorMessage = errorPayload.message;
        }
        setErrorMessage(errorMessage);
      }
    });
  };

  return (
    <Dialog
      open={!!todo}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setEditingTodo(null);
          setErrorMessage(undefined);
        }
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit To-do</DialogTitle>
          <DialogDescription>
            Update details of this to-do item.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
            className="space-y-4"
          >
            <div className="border-b pb-4">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm text-gray-600">
                <div>
                  <dt>Created At</dt>
                  <dd>{DateTime.fromISO(todo.createdAt, { zone: timeZone }).toFormat(timeFormat)}</dd>
                </div>

                <div>
                  <dt>Created By</dt>
                  <dd>{todo.createdBy}</dd>
                </div>

                <div>
                  <dt>Last Updated</dt>
                  <dd>{DateTime.fromISO(todo.updatedAt, { zone: timeZone }).toFormat(timeFormat)}</dd>
                </div>
                
                <UncontrolledFormField name="doneAt">
                  <FormItem>
                    <FormLabel>Done At</FormLabel>
                    <RegisteredFormControl>
                      <PopoverCalendar />
                    </RegisteredFormControl>
                    <FormMessage />
                  </FormItem>
                </UncontrolledFormField>
              </dl>
            </div>

            <UncontrolledFormField name="title">
              <FormItem>
                <FormLabel>Title</FormLabel>
                <RegisteredFormControl>
                  <Input />
                </RegisteredFormControl>
                <FormMessage />
              </FormItem>
            </UncontrolledFormField>

            <UncontrolledFormField name="description">
              <FormItem>
                <FormLabel>Description</FormLabel>
                <RegisteredFormControl>
                  <Textarea rows={8} className="resize-y max-h-[250] scrollbar-hide" />
                </RegisteredFormControl>
                <FormMessage />
              </FormItem>
            </UncontrolledFormField>
            <ErrorMessage message={errorMessage} />
            <DialogFooter>
              <Button type="submit" disabled={isPending} className="cursor-pointer">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}