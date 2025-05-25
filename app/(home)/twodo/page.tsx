import { Columns } from "@/app/(home)/twodo/columns";
import { DataTable } from "@/app/(home)/twodo/data-table";
import { todos } from "@/app/(home)/twodo/placeholder-data";

export default function Page() {
  return (
    <main className="flex items-start justify-center m-10 h-full">
      <DataTable columns={Columns} data={todos} />
    </main>
  );
}