interface TodoDto {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  priority: number;
  images: {
    url: string;
    key: string;
  }[];
  createdBy: {
    name: string;
    imageUrl: string | null;
  };
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
  imagesToUpload: { name: string; signedUrl: string }[];
}

export type { TodoDto, TodoResponse, TodoCreateResponse, TodoUpdateResponse };
