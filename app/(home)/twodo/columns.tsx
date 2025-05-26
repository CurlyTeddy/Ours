"use client";

import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Circle, CircleCheck } from "lucide-react";

export interface Todo {
  id: number
  title: string
  createdAt: Date
  createdBy: string
  description?: string
  status: boolean
}

export const Columns: ColumnDef<Todo>[] = [
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