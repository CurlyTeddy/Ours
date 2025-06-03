import { Columns } from "@/app/(home)/twodo/columns";
import { DataTable } from "@/app/(home)/twodo/data-table";
import { getTodos } from "@/app/(home)/twodo/repository";

export default async function Page() {
  const todos = await getTodos();
  return (
    <main className="flex items-start justify-center p-10 h-full">
      <DataTable columns={Columns} data={todos} />
    </main>
  );
}