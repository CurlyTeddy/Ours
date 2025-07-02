"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColumnDef, ColumnFilter, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, RowSelectionState, SortingState, useReactTable } from "@tanstack/react-table";
import { DataTablePagination } from "@/app/(home)/twodo/pagination";
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Input } from "@/components/ui/input";
import { CreateButton } from "@/app/(home)/twodo/create-button";
import DeleteButton from "@/app/(home)/twodo/delete-button";
import { Todo } from "@/app/(home)/twodo/columns";
import EditDialog from "@/app/(home)/twodo/edit-dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export function DataTable<TValue>({
  columns,
  data,
}: {
  columns: ColumnDef<Todo, TValue>[],
  data: Todo[],
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const handleFilterChange = useDebouncedCallback((value: string) => {
    table.getColumn("title")?.setFilterValue(value);
  }, 300);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useReactTable({
    data,
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
          onChange={(event) => { handleFilterChange(event.target.value); }}
          className="max-w-sm"
        />
        <div className="ml-auto flex items-center space-x-2">
          <CreateButton />
          <DeleteButton rowSelection={rowSelection} />
        </div>
      </div>
      <div className="rounded-md overflow-hidden border-2">
        <ScrollArea className="h-full w-full">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow isHeader key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={() => {
                    setEditingTodo(row.original);
                  }}
                  className="cursor-pointer"
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center">
                    No data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
      <DataTablePagination table={table} />

      {editingTodo && (
        <EditDialog todo={editingTodo} setEditingTodo={setEditingTodo}  />
      )}
    </div>
  );
}
