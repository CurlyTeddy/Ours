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
import { useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Input } from "@/components/ui/input";
import { CreateButton } from "@/features/two-dos/components/create-button";
import EditDialog from "@/features/two-dos/components/edit-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Circle, CircleCheck, Plus, Trash2 } from "lucide-react";
import { useTimeZone } from "@/components/providers/time-zone";
import { DateTime } from "luxon";
import { timeFormat, Todo } from "@/features/two-dos/models/views";
import Image from "next/image";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";
import { env } from "@/lib/env";
import ky from "ky";
import AlertDialogButton from "@/components/ui/alert-dialog-button";
import { Skeleton } from "@/components/ui/skeleton";

function TwodoTableSkeleton() {
  // Create skeleton rows
  const skeletonRows = Array.from({ length: 5 }, (_, index) => (
    <TableRow key={index}>
      {/* Select checkbox */}
      <TableCell>
        <Skeleton className="h-4 w-4" />
      </TableCell>
      {/* Image */}
      <TableCell>
        <div className="relative aspect-square">
          <Skeleton className="h-full w-full" />
        </div>
      </TableCell>
      {/* Title */}
      <TableCell>
        <Skeleton className="h-4 w-32" />
      </TableCell>
      {/* Created At */}
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      {/* Created By */}
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      {/* Description */}
      <TableCell>
        <Skeleton className="h-4 w-40" />
      </TableCell>
      {/* Status */}
      <TableCell>
        <Skeleton className="h-4 w-4 rounded-full" />
      </TableCell>
    </TableRow>
  ));

  return (
    <div className="flex flex-1 flex-col space-y-2">
      <div className="flex items-center py-4 space-x-2">
        <Skeleton className="h-10 w-60" />
        <div className="ml-auto flex items-center space-x-2">
          <Button disabled>
            <Plus />
            <span className="hidden sm:inline">Add</span>
          </Button>
          <Button variant="outline" disabled>
            <Trash2 />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </div>
      </div>

      {/* Table container */}
      <div className="relative flex-1">
        <div className="absolute inset-0 rounded-md border-2 overflow-hidden">
          <Table scrollable={false}>
            <TableHeader className="sticky top-0 z-10">
              <TableRow isHeader>
                <TableHead>
                  <Skeleton className="h-4 w-4" />
                </TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>
                  <Button variant={"plain"} className="cursor-pointer" disabled>
                    Created At
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{skeletonRows}</TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between px-2">
        <div className="flex-1 text-sm text-muted-foreground">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex items-center space-x-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
          <div className="flex w-20 items-center justify-center text-sm font-medium">
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TwodoTable() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const handleFilterChange = useDebouncedCallback((value: string) => {
    table.getColumn("title")?.setFilterValue(value);
  }, 300);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const timeZone = useTimeZone();

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
          cell: ({ row }) => {
            const imageKey = row.original.imageKeys[0];
            return (
              <div className="relative aspect-square">
                {row.original.imageKeys.length > 0 ? (
                  <Image
                    src={`${env.NEXT_PUBLIC_R2_ENDPOINT}/two-do/${row.original.imageKeys[0]}`}
                    alt={row.original.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    unoptimized={imageKey
                      .substring(0, imageKey.lastIndexOf("-"))
                      .endsWith("gif")}
                  />
                ) : (
                  <Image
                    src="/howl.gif"
                    alt={"A default for two-do"}
                    fill
                    unoptimized
                    priority
                  />
                )}
              </div>
            );
          },
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
    [timeZone],
  );

  const { key, todos, isLoading, mutate } = useTodos();

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

  const handleDelete = async () => {
    const selectTodoIds = table
      .getSelectedRowModel()
      .rows.map((row) => row.original.id);
    const removeSet = new Set(selectTodoIds);

    await mutate(
      async (todos = []) => {
        await Promise.all(selectTodoIds.map((id) => ky.delete(`${key}/${id}`)));
        table.resetRowSelection();
        return todos.filter((todo) => !removeSet.has(todo.id));
      },
      {
        optimisticData: (todos = []) => {
          return todos.filter((todo) => !removeSet.has(todo.id));
        },
        revalidate: false,
      },
    );
  };

  if (isLoading) {
    return <TwodoTableSkeleton />;
  }

  return (
    <div className="flex flex-1 flex-col space-y-2">
      <div className="flex items-center py-4 space-x-2">
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
          <AlertDialogButton
            alertTitle="Are you sure?"
            alertDescription="This action will delete the selected to-dos and cannot be undone."
            confirmButtonText="Delete"
            disabled={table.getSelectedRowModel().rows.length === 0}
            onConfirm={handleDelete}
            defaultErrorMessage="Failed to delete todo. Please try again later."
            buttonClassName="cursor-pointer hover:text-destructive"
            buttonVariant="outline"
          >
            <Trash2 />
            <span className="hidden sm:inline">Delete</span>
          </AlertDialogButton>
        </div>
      </div>
      <div className="relative flex-1">
        <div className="absolute inset-0 rounded-md border-2 overflow-hidden">
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
              {table.getRowModel().rows.map((row) => (
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
              ))}
            </TableBody>
          </Table>
          {table.getRowModel().rows.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
              <div className="flex flex-col items-center space-y-4">
                <div className="relative w-32 h-32">
                  <Image
                    src={"/poor_golden.png"}
                    alt="Cute dog waiting for todos"
                    fill
                    className="object-cover"
                    loading="eager"
                    sizes="w-32 h-32"
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-muted-foreground">
                    No to-dos yet!
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    This cute pup is waiting for you to add some tasks
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <DataTablePagination table={table} />

      {editingTodo && (
        <EditDialog todo={editingTodo} setEditingTodo={setEditingTodo} />
      )}
    </div>
  );
}
