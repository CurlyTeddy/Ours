import { maxFileSize, timeFormat, Todo } from "@/features/two-dos/models/views";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { updateSchema } from "@/features/two-dos/models/views";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTimeZone } from "@/components/providers/time-zone";
import { DateTime } from "luxon";
import { useEffect, useState, useTransition } from "react";
import {
  Form,
  FormItem,
  FormLabel,
  FormMessage,
  UncontrolledFormField,
  RegisteredFormControl,
  FormField,
  FormControl,
} from "@/components/ui/form";
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
import { FileUploader } from "@/components/ui/file-uploader";
import { env } from "@/lib/env";

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
      doneAt: todo.doneAt
        ? DateTime.fromISO(todo.doneAt, { zone: timeZone }).toFormat(dateFormat)
        : null,
      images: [],
    },
  });

  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const { key, mutate } = useTodos();

  // Preload images for the form
  useEffect(() => {
    // An extra fetch for the two-do image, consider to optimize it if encounter performance issues
    Promise.all(
      todo.imageKeys.map((key) =>
        ky.get(`${env.NEXT_PUBLIC_R2_ENDPOINT}/two-do/${key}`).blob(),
      ),
    ).then(
      (blobs) => {
        const images = blobs.map((blob, index) => {
          return new File([blob], todo.imageKeys[index], { type: blob.type });
        });
        form.setValue("images", images);
      },
      () => {
        console.error("Unable to fetch images");
      },
    );
  }, [todo.imageKeys, form]);

  const onSubmit = (data: z.infer<typeof updateSchema>) => {
    startTransition(async () => {
      try {
        await mutate(
          async (todos = []) => {
            const response = await ky
              .put(`${key}/${todo.id}`, {
                json: {
                  title: data.title,
                  description: data.description ?? null,
                  doneAt:
                    !data.doneAt || data.doneAt.length === 0
                      ? null
                      : DateTime.fromFormat(data.doneAt, dateFormat, {
                          zone: timeZone,
                        }).toISO(),
                  imageNames: data.images.map((image) => image.name),
                } satisfies TodoUpdateRequest,
              })
              .json<TodoUpdateResponse>();

            const imageByName = new Map(
              data.images.map((image) => [image.name, image]),
            );
            await Promise.all(
              response.imagesToUpload.map(({ name, signedUrl }) =>
                ky.put(signedUrl, {
                  headers: imageByName.get(name)
                    ? { "Content-Type": imageByName.get(name)?.type }
                    : undefined,
                  body: imageByName.get(name),
                }),
              ),
            );

            return todos.map((todo) =>
              todo.id === response.todo.id
                ? {
                    ...todo,
                    title: response.todo.title,
                    description: response.todo.description,
                    doneAt: response.todo.doneAt,
                    updatedAt: response.todo.updatedAt,
                    imageKeys: response.todo.imageKeys,
                  }
                : todo,
            );
          },
          {
            revalidate: false,
          },
        );

        setErrorMessage(undefined);
        setEditingTodo(null);
      } catch (error) {
        let errorMessage = "Failed to update todo. Please try again later.";
        console.error(error);
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
      <DialogContent className="sm:max-w-[700px]">
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
              <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm text-muted-foreground">
                <div>
                  <dt>Created At</dt>
                  <dd>
                    {DateTime.fromISO(todo.createdAt, {
                      zone: timeZone,
                    }).toFormat(timeFormat)}
                  </dd>
                </div>

                <div>
                  <dt>Created By</dt>
                  <dd>{todo.createdBy.name}</dd>
                </div>

                <div>
                  <dt>Last Updated</dt>
                  <dd>
                    {DateTime.fromISO(todo.updatedAt, {
                      zone: timeZone,
                    }).toFormat(timeFormat)}
                  </dd>
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
                  <Textarea
                    rows={8}
                    className="resize-y max-h-[250] scrollbar-hide"
                  />
                </RegisteredFormControl>
                <FormMessage />
              </FormItem>
            </UncontrolledFormField>

            <FormField
              name="images"
              render={({ field }) => {
                const { onChange, ...rest } = field;
                return (
                  <FormItem>
                    <FormLabel>Images</FormLabel>
                    <FormControl>
                      <FileUploader
                        {...rest}
                        onValueChange={onChange}
                        multiple={false}
                        maxSize={maxFileSize}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <ErrorMessage message={errorMessage} />
            <DialogFooter>
              <Button
                type="submit"
                disabled={isPending}
                className="cursor-pointer"
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
