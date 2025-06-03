"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Circle, CircleCheck } from "lucide-react";

export interface Todo {
  id: string
  title: string
  createdAt: Date
  createdBy: string
  description: string | null
  status: boolean
}

export const Columns: ColumnDef<Todo>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected() || table.getIsSomeRowsSelected() && "indeterminate"}
        onCheckedChange={(value) => { table.toggleAllRowsSelected(!!value); }}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => { row.toggleSelected(!!value); }}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: "Title",
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <Button variant={"plain"} className="cursor-pointer" onClick={() => { column.toggleSorting(column.getIsSorted() === "asc"); }}>
        Created At
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "createdBy",
    header: "Created By",
  },
  {
    accessorKey: "description",
    header: "Description",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (row.getValue("status") ? <CircleCheck className="text-green-500" /> : <Circle className="text-gray-400" />),
  },
];