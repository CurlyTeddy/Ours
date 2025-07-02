"use client";

import { DataTable } from "@/features/two-dos/components/data-table";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";

export default function Page() {
  const { todos } = useTodos();

  return (
    <main className="flex items-start justify-center p-10 h-full">
      <DataTable data={todos} />
    </main>
  );
}