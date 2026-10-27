"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { Input } from "@atlaskit/pragmatic-drag-and-drop/types";
import type { ListKey } from "@/features/two-dos/lists";

// What is being dragged, and what it is over. Rows reorder inside "rows";
// a "list" is a sidebar row or chip a to-do can be dropped on; "trips" holds the trip rows.
interface DragSource {
  kind: "todo" | "trip";
  id: string;
}
type DropData =
  | { target: "rows" }
  | { target: "trips" }
  | { target: "list"; list: ListKey };

// The drag in progress. index is the landing slot in the dragged item's own list;
// over is another list a to-do would be dropped on; edge is the trip chip side a trip would land at.
type DragState =
  | { kind: "todo"; id: string; index: number; over: ListKey | null }
  | {
      kind: "trip";
      id: string;
      index: number;
      edge: { id: string; side: "left" | "right" } | null;
    };

// The order shown while dragging: the dragged item sits in its landing slot, the rest close up.
function landingOrder<T extends { id: string }>(
  items: T[],
  drag: { id: string; index: number } | null,
): T[] {
  const dragged = drag && items.find((item) => item.id === drag.id);
  if (!drag || !dragged) return items;
  return items
    .filter((item) => item !== dragged)
    .toSpliced(drag.index, 0, dragged);
}

const isDragSource = (
  data: Record<string, unknown>,
): data is DragSource & Record<string, unknown> =>
  (data.kind === "todo" || data.kind === "trip") && typeof data.id === "string";

// Native drag and drop, so touch gets the browser's long-press to start.
function useDraggable(
  ref: RefObject<HTMLElement | null>,
  source: DragSource,
  handle?: RefObject<HTMLElement | null>,
) {
  const { kind, id } = source;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return draggable({
      element,
      dragHandle: handle?.current ?? undefined,
      getInitialData: () => ({ kind, id }),
    });
  }, [ref, handle, kind, id]);
}

function useDropTarget(
  ref: RefObject<HTMLElement | null>,
  accepts: DragSource["kind"][],
  getData: (args: {
    input: Input;
    element: Element;
  }) => DropData & Record<string | symbol, unknown>,
) {
  const readData = useEffectEvent(getData);
  // A string, so a fresh array each render does not re-register the target
  const kinds = accepts.join(" ");
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) =>
        isDragSource(source.data) && kinds.includes(source.data.kind),
      getData: (args) => readData(args),
    });
    // Effect Events always see the latest render and must stay out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, kinds]);
}

export { isDragSource, landingOrder, useDraggable, useDropTarget };
export type { DragSource, DragState, DropData };
