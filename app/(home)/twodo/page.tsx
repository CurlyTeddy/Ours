"use client";

import { columns } from "@/app/(home)/twodo/columns";
import { DataTable } from "@/app/(home)/twodo/data-table";
import { useTodos } from "@/app/(home)/twodo/hooks";

export default function Page() {
  const { todos } = useTodos();

  return (
    <main className="flex items-start justify-center p-10 h-full">
      <DataTable columns={columns} data={todos} />
    </main>
  );
}