"use client";

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, RegisteredFormControl, UncontrolledFormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { Dialog, DialogHeader, DialogTitle, DialogTrigger, DialogContent, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";
import { createSchema, maxFileSize } from "@/features/two-dos/models/views";
import { zodResolver } from "@hookform/resolvers/zod";
import ErrorMessage from "@/components/ui/error-message";
import { FileUploader } from "@/components/ui/file-uploader";
import ky, { HTTPError } from "ky";
import { TodoCreateRequest } from "@/features/two-dos/models/requests";
import { TodoCreateResponse } from "@/features/two-dos/models/responses";
import { HttpErrorPayload } from "@/lib/error";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";
import { useSWRConfig } from "swr";

function CreateButton() {
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      title: "",
      description: "",
      images: [],
    },
  });

  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const { todos } = useTodos({
    revalidateIfStale: false,
  });
  const { mutate } = useSWRConfig();

  const onSubmit = (formData: z.infer<typeof createSchema>) => {
    startTransition(async () => {
      try {
        const { newTodo, signedUrls } = await ky.post("/api/todos", {
          json: {
            title: formData.title,
            description: formData.description,
            imageNames: formData.images.map((file) => file.name),
          } satisfies TodoCreateRequest,
        }).json<TodoCreateResponse>();

        await mutate("/api/todos", [...todos, newTodo], {
          revalidate: false,
        });

        setOpen(false);
        form.reset();
        setErrorMessage(undefined);

        await Promise.all(signedUrls.map(
          (url, index) => ky.put(
            url,
            {
              headers: { "Content-Type": formData.images[index].type },
              body: formData.images[index],
            },
          )
        ));
      } catch (error) {
        let errorMessage = "Failed to create todo. Please try again later.";
        if (error instanceof HTTPError) {
          const errorPayload = await error.response.json<HttpErrorPayload>();
          errorMessage = errorPayload.message;
        }
        console.error("Error creating todo:", error);
        setErrorMessage(errorMessage);
      };
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          form.reset();
          setErrorMessage(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="cursor-pointer">Add Todo</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Add Todo</DialogTitle>
          <DialogDescription>
            Add a new todo item. It will have the lowest priority.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          {/* https://github.com/orgs/react-hook-form/discussions/8622#discussioncomment-6305393 */}
          <form
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
            className="space-y-4"
          >
            <UncontrolledFormField name="title">
              <FormItem>
                <FormLabel>Title</FormLabel>
                <RegisteredFormControl>
                  <Input placeholder="e.g. Have a Golden Retriever!" autoFocus />
                </RegisteredFormControl>
                <FormDescription>
                  Enter the title of the next excitement.
                </FormDescription>
                <FormMessage />
              </FormItem>
            </UncontrolledFormField>

            <UncontrolledFormField name="description">
              <FormItem>
                <FormLabel>Description</FormLabel>
                <RegisteredFormControl>
                  <Textarea placeholder="e.g. Its name is Dory." rows={3} className="resize-y max-h-[250] scrollbar-hide" />
                </RegisteredFormControl>
                <FormDescription>
                  Optionally, add a description for more details.
                </FormDescription>
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
                        maxFiles={2}
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
              <Button type="submit" disabled={isPending} className="cursor-pointer">Add Todo</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export { CreateButton };