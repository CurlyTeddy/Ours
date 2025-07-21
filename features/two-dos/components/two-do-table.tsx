"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ColumnDef,
  ColumnFilter,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  RowSelectionState,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { DataTablePagination } from "@/components/ui/pagination";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Input } from "@/components/ui/input";
import { CreateButton } from "@/features/two-dos/components/create-button";
import DeleteButton from "@/features/two-dos/components/delete-button";
import EditDialog from "@/features/two-dos/components/edit-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Circle, CircleCheck } from "lucide-react";
import { useTimeZone } from "@/components/providers/time-zone";
import { DateTime } from "luxon";
import { timeFormat, Todo } from "@/features/two-dos/models/views";
import Image from "next/image";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";

export function TwodoTable() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const handleFilterChange = useDebouncedCallback((value: string) => {
    table.getColumn("title")?.setFilterValue(value);
  }, 300);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const timeZone = useTimeZone();
  const public_r2_host = process.env.NEXT_PUBLIC_R2_ENDPOINT;

  const columns = useMemo(
    () =>
      [
        {
          id: "select",
          header: ({ table }) => (
            <Checkbox
              checked={
                table.getIsAllRowsSelected() ||
                (table.getIsSomeRowsSelected() && "indeterminate")
              }
              onCheckedChange={(value) => {
                table.toggleAllRowsSelected(!!value);
              }}
              aria-label="Select all"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => {
                row.toggleSelected(!!value);
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
              aria-label="Select row"
            />
          ),
          enableSorting: false,
          enableHiding: false,
        },
        {
          id: "image",
          header: "Image",
          cell: ({ row }) => (
            <div className="relative aspect-square">
              {public_r2_host && row.original.imageKeys.length > 0 ? (
                <Image
                  src={`${public_r2_host}/two-do/${row.original.imageKeys[0]}`}
                  alt={row.original.title}
                  fill
                  unoptimized={row.original.imageKeys[0].endsWith("gif")}
                />
              ) : (
                <Image
                  src={"/howl.gif"}
                  alt={"A default for two-do"}
                  fill
                  unoptimized
                  priority
                />
              )}
            </div>
          ),
        },
        {
          accessorKey: "title",
          header: "Title",
        },
        {
          accessorKey: "createdAt",
          header: ({ column }) => (
            <Button
              variant={"plain"}
              className="cursor-pointer"
              onClick={() => {
                column.toggleSorting(column.getIsSorted() === "asc");
              }}
            >
              Created At
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          ),
          cell: ({ row }) => {
            return DateTime.fromISO(row.getValue<string>("createdAt"), {
              zone: timeZone,
            }).toFormat(timeFormat);
          },
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
          cell: ({ row }) =>
            row.getValue("status") ? (
              <CircleCheck className="text-green-500" />
            ) : (
              <Circle className="text-gray-400" />
            ),
        },
      ] as ColumnDef<Todo>[],
    [timeZone, public_r2_host],
  );

  const { todos } = useTodos();

  const table = useReactTable({
    data: todos,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
    getRowId: (row) => row.id,
  });

  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col space-y-2">
      <div className="flex items-center py-4">
        <Input
          name="title-filter"
          placeholder="Filter titles..."
          onChange={(event) => {
            handleFilterChange(event.target.value);
          }}
          className="max-w-sm"
        />
        <div className="ml-auto flex items-center space-x-2">
          <CreateButton />
          <DeleteButton table={table} />
        </div>
      </div>
      <div className="relative flex flex-1">
        <div className="absolute inset-0 flex rounded-md border-2 overflow-hidden">
          <Table scrollable={false}>
            <TableHeader className="sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow isHeader key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => {
                      setEditingTodo(row.original);
                    }}
                    className="cursor-pointer"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center">
                    No data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <DataTablePagination table={table} />

      {editingTodo && (
        <EditDialog todo={editingTodo} setEditingTodo={setEditingTodo} />
      )}
    </div>
  );
}
