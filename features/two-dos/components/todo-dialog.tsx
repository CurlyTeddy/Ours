"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ky from "ky";
import { Trash2 } from "lucide-react";
import {
  Form,
  FormField,
  FormItem,
  FormMessage,
  RegisteredFormControl,
  UncontrolledFormField,
} from "@/components/ui/form";
import ErrorMessage from "@/components/ui/error-message";
import AlertDialogButton from "@/components/ui/alert-dialog-button";
import { getErrorMessage } from "@/lib/error";
import type { ImageUpload } from "@/lib/image-upload";
import { cn } from "@/lib/utils";
import {
  BoardModal,
  fieldClass,
  ghostButton,
  labelClass,
  primaryButton,
} from "@/features/two-dos/components/board-modal";
import { CarouselUploader } from "@/features/two-dos/components/carousel-uploader";
import { LocationCombobox } from "@/features/two-dos/components/location-combobox";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";
import { listKeyOf, type ListKey } from "@/features/two-dos/lists";
import type {
  TodoCreateRequest,
  TodoUpdateRequest,
} from "@/features/two-dos/models/requests";
import type {
  TodoCreateResponse,
  TodoUpdateResponse,
} from "@/features/two-dos/models/responses";
import type { TripDto } from "@/features/two-dos/models/trip";
import {
  todoFormSchema,
  toTodo,
  type Todo,
  type TodoForm,
} from "@/features/two-dos/models/views";

// Index prefix keeps same-named files (iOS names them all image.jpg) apart
const imageName = (image: File, index: number) =>
  `${index.toString()}-${image.name}`;

// The server signs each upload URL for this exact size and type; the form's mime check vouches for the type
const imageUpload = (image: File, index: number) => ({
  name: imageName(image, index),
  size: image.size,
  type: image.type as ImageUpload["type"],
});

const tripIdOf = (list: ListKey) =>
  list === "inspiration" || list === "unsorted" ? null : list;

// New to-do (todo omitted) or Edit to-do. onSaved gets the saved to-do.
function TodoDialog({
  todo,
  defaultList,
  trips,
  onSaved,
  onClose,
}: {
  todo?: Todo;
  defaultList: ListKey;
  trips: TripDto[];
  onSaved: (saved: Todo) => void;
  onClose: () => void;
}) {
  const startList = todo ? listKeyOf(todo) : defaultList;
  const form = useForm<TodoForm>({
    resolver: zodResolver(todoFormSchema),
    defaultValues: {
      title: todo?.title ?? "",
      list: startList,
      location: todo?.location ?? null,
      description: todo?.description ?? "",
      images: [],
    },
  });
  const [existingImages, setExistingImages] = useState(todo?.images ?? []);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const { key, mutate } = useTodos();
  const blank = form.watch("title").trim() === "";
  const title = todo ? "Edit to-do" : "New to-do";

  const create = async (data: TodoForm) => {
    const response = await ky
      .post(key, {
        json: {
          title: data.title,
          description: data.description || undefined,
          location: data.location,
          tripId: tripIdOf(data.list),
          images: data.images.map(imageUpload),
        } satisfies TodoCreateRequest,
      })
      .json<TodoCreateResponse>();
    try {
      await Promise.all(
        response.signedUrls.map((url, index) =>
          ky.put(url, {
            headers: { "Content-Type": data.images[index].type },
            body: data.images[index],
          }),
        ),
      );
    } catch (error) {
      // The todo already exists; drop it so a retry does not leave a broken duplicate
      await ky.delete(`${key}/${response.todo.id}`).catch(() => null);
      throw error;
    }
    return toTodo(response.todo);
  };

  const update = async (current: Todo, data: TodoForm) => {
    const url = `${key}/${current.id}`;
    const request = {
      title: data.title,
      description: data.description || null,
      location: data.location,
      // Unsorted is a done item with no trip, so keeping it there keeps tripId null
      tripId: tripIdOf(data.list),
      imageNames: [
        ...existingImages.map((image) => image.key),
        ...data.images.map(imageName),
      ],
      uploads: data.images.map(imageUpload),
    } satisfies TodoUpdateRequest;
    const response = await ky
      .put(url, { json: request })
      .json<TodoUpdateResponse>();

    const imageByName = new Map(
      data.images.map((image, index) => [imageName(image, index), image]),
    );
    try {
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
    } catch (error) {
      // The todo already lists the new keys; drop them so it shows no broken images
      await ky
        .put(url, {
          json: {
            ...request,
            imageNames: existingImages.map((image) => image.key),
          },
        })
        .catch(() => null);
      throw error;
    }
    return toTodo(response.todo);
  };

  const onSubmit = (data: TodoForm) => {
    if (todo?.status && data.list === "inspiration") {
      form.setError("list", {
        message:
          "Inspiration can’t hold done items — pick a trip, or untick it first",
      });
      return;
    }
    startTransition(async () => {
      try {
        const saved = todo ? await update(todo, data) : await create(data);
        await mutate(
          (current = []) =>
            todo
              ? current.map((other) => (other.id === saved.id ? saved : other))
              : [...current, saved],
          { revalidate: false },
        );
        onSaved(saved);
      } catch (error) {
        console.error(error);
        setErrorMessage(
          await getErrorMessage(
            error,
            todo
              ? "Failed to update todo. Please try again later."
              : "Failed to create todo. Please try again later.",
          ),
        );
      }
    });
  };

  const remove = async (current: Todo) => {
    await mutate(
      async (todos = []) => {
        await ky.delete(`${key}/${current.id}`);
        return todos.filter((other) => other.id !== current.id);
      },
      { revalidate: false },
    );
    onClose();
  };

  return (
    <BoardModal label={title} onClose={onClose} className="max-w-125">
      <h3 className="text-[22px] font-black">{title}</h3>
      <Form {...form}>
        <form
          noValidate
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
          className="flex flex-col gap-4.5"
        >
          <UncontrolledFormField name="title">
            <FormItem>
              <label className={labelClass} htmlFor="todo-title">
                Title
              </label>
              <RegisteredFormControl>
                <input
                  id="todo-title"
                  type="text"
                  autoFocus={!todo}
                  placeholder="Something to do together…"
                  className={fieldClass}
                />
              </RegisteredFormControl>
              <FormMessage />
            </FormItem>
          </UncontrolledFormField>

          <UncontrolledFormField name="list">
            <FormItem>
              <label className={labelClass} htmlFor="todo-trip">
                Trip
              </label>
              <RegisteredFormControl>
                <select id="todo-trip" className={cn(fieldClass, "pr-9")}>
                  <option value="inspiration">
                    Inspiration · Ideas for someday
                  </option>
                  {startList === "unsorted" ? (
                    <option value="unsorted">
                      Unsorted · waiting for a trip
                    </option>
                  ) : null}
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.name}
                    </option>
                  ))}
                </select>
              </RegisteredFormControl>
              <FormMessage className="text-[12.5px] font-extrabold text-us-danger" />
            </FormItem>
          </UncontrolledFormField>

          <FormField
            name="location"
            render={({ field }) => (
              <LocationCombobox
                value={field.value as TodoForm["location"]}
                onChange={field.onChange}
                disabled={isPending}
              />
            )}
          />

          <UncontrolledFormField name="description">
            <FormItem>
              <label className={labelClass} htmlFor="todo-description">
                Description
              </label>
              <RegisteredFormControl>
                <textarea
                  id="todo-description"
                  rows={3}
                  placeholder="Optional"
                  className={cn(
                    fieldClass,
                    "h-auto min-h-21 resize-y py-3 leading-normal",
                  )}
                />
              </RegisteredFormControl>
            </FormItem>
          </UncontrolledFormField>

          <FormField<TodoForm, "images">
            name="images"
            render={({ field }) => (
              <CarouselUploader
                existingImages={existingImages}
                onExistingImagesChange={setExistingImages}
                field={field}
                isPending={isPending}
              />
            )}
          />

          <ErrorMessage message={errorMessage} />

          <div className="flex flex-wrap items-center justify-end gap-2">
            {todo ? (
              <AlertDialogButton
                buttonVariant="ghost"
                buttonClassName="mr-auto h-11 cursor-pointer rounded-xl px-3 font-extrabold text-us-danger hover:bg-us-hover hover:text-us-danger"
                disabled={isPending}
                alertTitle="Delete this to-do?"
                alertDescription="It leaves every list and the map. This cannot be undone."
                confirmButtonText="Delete"
                defaultErrorMessage="Failed to delete todo. Please try again later."
                onConfirm={() => remove(todo)}
              >
                <Trash2 aria-hidden="true" />
                Delete to-do
              </AlertDialogButton>
            ) : null}
            <button type="button" onClick={onClose} className={ghostButton}>
              Cancel
            </button>
            <button
              type="submit"
              aria-disabled={blank || isPending}
              className={primaryButton}
            >
              {todo ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </Form>
    </BoardModal>
  );
}

export { TodoDialog };
