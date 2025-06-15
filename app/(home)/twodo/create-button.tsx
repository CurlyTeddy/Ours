"use client";

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Dialog, DialogHeader, DialogTitle, DialogTrigger, DialogContent, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";
import { addTodo } from "@/app/(home)/twodo/repository";
import { createSchema } from "@/app/(home)/twodo/form-schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import ErrorMessage from "@/components/ui/error-message";

function CreateButton() {
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      title: "",
      description: "",
    },
  });

  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (data: z.infer<typeof createSchema>) => {
    startTransition(async() => {
      const message = await addTodo(data);
      setErrorMessage(message);
      if (!message) {
        setOpen(false);
        form.reset();
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setErrorMessage(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button className="cursor-pointer">Add Todo</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
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
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Have a Golden Retriever!" autoFocus {...field} />
                  </FormControl>
                  <FormDescription>
                    Enter the title of the next excitement.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g. Its name is Dory." rows={8} className="resize-y max-h-[250] scrollbar-hide" {...field} />
                  </FormControl>
                  <FormDescription>
                    Optionally, add a description for more details.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
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