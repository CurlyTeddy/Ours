import { Todo } from "@/app/(home)/twodo/columns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { updateSchema } from "@/app/(home)/twodo/form-schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTimeZone } from "@/components/providers/time-zone";
import { DateTime } from "luxon";
import { useState, useTransition } from "react";
import { updateTodo } from "@/app/(home)/twodo/repository";
import { Form, FormItem, FormLabel, FormMessage, UncontrolledFormField, RegisteredFormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import ErrorMessage from "@/components/ui/error-message";
import PopoverCalendar from "@/components/ui/popover-calendar";

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
      doneAt: todo.doneAt ? DateTime.fromJSDate(todo.doneAt, { zone: timeZone }).toFormat("MMM dd, yyyy") : "",
    },
  });

  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const onSubmit = (data: z.infer<typeof updateSchema>) => {
    startTransition(async () => {
      const message = await updateTodo(todo.id, {
        ...data,
        doneAt: data.doneAt ? DateTime.fromFormat(data.doneAt, "MMM dd, yyyy", { zone: timeZone }).toJSDate() : null,
      });
      setErrorMessage(message);
      if (!message) {
        setEditingTodo(null);
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
                  <dd>{DateTime.fromJSDate(todo.createdAt, { zone: timeZone }).toFormat("yyyy-MM-dd HH:mm")}</dd>
                </div>

                <div>
                  <dt>Created By</dt>
                  <dd>{todo.createdBy}</dd>
                </div>

                <div>
                  <dt>Last Updated</dt>
                  <dd>{DateTime.fromJSDate(todo.updatedAt, { zone: timeZone }).toFormat("yyyy-MM-dd HH:mm")}</dd>
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