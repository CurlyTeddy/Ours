interface TodoCreateRequest {
  title: string;
  description?: string;
  imageNames: string[];
}

interface TodoUpdateRequest {
  title: string;
  description: string | null;
  doneAt: string | null;
}

export type { TodoCreateRequest, TodoUpdateRequest };