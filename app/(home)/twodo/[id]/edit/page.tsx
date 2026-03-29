"use client";

import { use } from "react";
import EditForm from "@/features/two-dos/components/edit-form";
import { useTodo } from "@/features/two-dos/hooks/use-todo";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: todo, isLoading } = useTodo(id);
  const router = useRouter();

  if (isLoading) {
    return (
      <main className="flex flex-col flex-1 px-4 sm:px-10 mb-10 max-w-3xl self-center w-full space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  if (!todo) {
    router.replace("/twodo");
    return null;
  }

  return (
    <main className="flex flex-col flex-1 px-4 sm:px-10 mb-10 max-w-3xl self-center w-full">
      <EditForm todo={todo} />
    </main>
  );
}
