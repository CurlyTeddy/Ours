import { maxFileSize, timeFormat, Todo } from "@/features/two-dos/models/views";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ControllerRenderProps, useForm } from "react-hook-form";
import { z } from "zod/v4";
import { updateSchema } from "@/features/two-dos/models/views";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTimeZone } from "@/components/providers/time-zone";
import { DateTime } from "luxon";
import {
  useEffect,
  useState,
  useTransition,
  useRef,
  useImperativeHandle,
  ChangeEvent,
  useMemo,
} from "react";
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
import { env } from "@/lib/env";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselApi,
} from "@/components/ui/carousel";
import { Upload, Trash2 } from "lucide-react";
import Image from "next/image";
import AlertDialogButton from "@/components/ui/alert-dialog-button";
import { toast } from "sonner";

interface PreviewImage {
  file: File;
  preview: string;
}

function CarouselUploader({
  field,
  isPending,
}: {
  field: ControllerRenderProps<z.infer<typeof updateSchema>, "images">;
  isPending: boolean;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const fileInput = useRef<HTMLInputElement>(null);
  const { value: images, ref, onChange, ...rest } = field;
  useImperativeHandle(ref, () => fileInput.current);

  const previewImages: PreviewImage[] = useMemo(() => {
    if (!images?.length) {
      return [];
    }
    return images.map((image) => ({
      file: image,
      preview: URL.createObjectURL(image),
    }));
  }, [images]);

  useEffect(() => {
    return () =>
      previewImages.forEach((image) => URL.revokeObjectURL(image.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) {
      return;
    }

    const newImages = Array.from(event.target.files);

    if (newImages.length + event.target.files.length >= 5) {
      toast.info("A twodo can only have at most five images.");
      return;
    }

    if (!newImages.every((image) => image.size <= maxFileSize)) {
      toast.info("Images size need to be smaller than 5 GB.");
    }

    onChange([...images, ...newImages]);
    toast.success("Image uploaded successfully!");
  };

  const onImageDelete = () => {
    if (previewImages.length === 0 || api === undefined) {
      return;
    }

    const currentIndex = api.selectedScrollSnap();
    URL.revokeObjectURL(previewImages[currentIndex].preview);
    onChange(images.filter((_, index) => index !== currentIndex));
    toast.success("Image deleted successfully!");
  };

  return (
    <FormItem>
      <div className="flex items-center justify-between">
        <FormLabel>Images</FormLabel>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={isPending}
            className="bg-primary hover:bg-primary/90 cursor-pointer"
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </Button>

          <AlertDialogButton
            buttonVariant="outline"
            buttonSize="sm"
            buttonClassName="cursor-pointer hover:text-destructive sm:flex"
            disabled={previewImages.length === 0 || isPending}
            onConfirm={onImageDelete}
            confirmButtonVariant="destructive"
            alertTitle="Are you sure?"
            alertDescription="You will delete the current image. The action cannot be undone."
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Delete</span>
          </AlertDialogButton>
        </div>
      </div>
      <FormControl>
        <Input
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInput}
          onChange={onImageUpload}
          multiple
          disabled={isPending}
          {...rest}
        />
      </FormControl>
      <Carousel setApi={setApi}>
        {previewImages.length > 0 ? (
          <CarouselContent className="m-0">
            {previewImages.map((image, index) => (
              <CarouselItem key={image.file.name} className="p-0">
                <div className="relative aspect-[4/3] overflow-hidden bg-muted rounded-lg">
                  <Image
                    src={image.preview}
                    alt={image.file.name}
                    fill
                    sizes="(max-width: 768px) 80vw, (max-width: 1200px) 60vw, 50vw"
                    className="object-cover"
                    priority={index === 0}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        ) : (
          <div className="aspect-[4/3] border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50 rounded-xl">
            <div className="text-center p-8">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground text-sm mb-2">
                No images yet. Upload at most five images!
              </p>
            </div>
          </div>
        )}
        {previewImages.length > 1 && (
          <>
            <CarouselPrevious className="left-4 bg-white/80 hover:bg-white border-0 shadow-md" />
            <CarouselNext className="right-4 bg-white/80 hover:bg-white border-0 shadow-md" />
          </>
        )}
      </Carousel>
      <FormMessage />
    </FormItem>
  );
}

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
    defaultValues: async () => {
      const blobs = await Promise.all(
        todo.imageKeys.map((key) =>
          ky.get(`${env.NEXT_PUBLIC_R2_ENDPOINT}/two-do/${key}`).blob(),
        ),
      );

      return {
        title: todo.title,
        description: todo.description ?? "",
        doneAt: todo.doneAt
          ? DateTime.fromISO(todo.doneAt, { zone: timeZone }).toFormat(
              dateFormat,
            )
          : null,
        images: blobs.map(
          (blob, index) =>
            new File([blob], todo.imageKeys[index], { type: blob.type }),
        ),
      };
    },
  });

  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const { key, mutate } = useTodos();

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
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit To-do</DialogTitle>
          <DialogDescription>
            Update details of this to-do item.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 -mr-2 scrollbar-hide">
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

              <FormField<z.infer<typeof updateSchema>, "images">
                name="images"
                render={({ field }) => (
                  <CarouselUploader field={field} isPending={isPending} />
                )}
              />

              <ErrorMessage message={errorMessage} />
            </div>

            <DialogFooter className="flex-shrink-0 mt-4">
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
