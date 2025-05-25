import { Todo } from "@/app/(home)/twodo/columns";

export const todos: Todo[] = [
    {
        id: 1,
        title: "Learn TypeScript",
        createdAt: new Date().toISOString(),
        createdBy: "John Doe",
        description: "Understand the basics of TypeScript and its features",
        status: false,
    },
    {
        id: 2,
        title: "Build a Todo App",
        createdAt: new Date().toISOString(),
        createdBy: "Jane Smith",
        description: "Create a simple Todo application using TypeScript",
        status: true,
    }, 
    {
        id: 3,
        title: "Deploy the App",
        createdAt: new Date().toISOString(),
        createdBy: "John Doe",
        status: false,
    },
];