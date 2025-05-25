"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Circle, CircleCheck } from "lucide-react";

export interface Todo {
  id: number
  title: string
  createdAt: string
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
    header: "Created At",
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