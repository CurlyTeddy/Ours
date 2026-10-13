import { TodoLocation } from "@/features/two-dos/models/location";

interface TodoCreateRequest {
  title: string;
  description?: string;
  location: TodoLocation;
  imageNames: string[];
}

interface TodoUpdateRequest {
  title: string;
  description: string | null;
  location: TodoLocation;
  doneAt: string | null;
  imageNames: string[];
}

export type { TodoCreateRequest, TodoUpdateRequest };
