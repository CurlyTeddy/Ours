interface TodoDto {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  priority: number;
  imageKeys: string[] | null;
  createdById: string;
  createdBy: string;
}

interface TodoResponse {
  todos: TodoDto[];
}

interface TodoCreateResponse {
  signedUrls: string[];
  todo: TodoDto;
}

interface TodoUpdateResponse {
  todo: TodoDto;
}

export type { TodoDto, TodoResponse, TodoCreateResponse, TodoUpdateResponse };