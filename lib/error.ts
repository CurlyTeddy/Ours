import { ZodIssue } from "zod";

export interface HttpErrorPayload {
  message: string;
  validationIssues?: ZodIssue[];
}