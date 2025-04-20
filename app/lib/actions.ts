'use server';

import { signIn } from "@/middlewares/auth";
import { AuthError } from "next-auth";

export async function authenticate(previousState: string | undefined, formData: FormData) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'An unexpected error occurred. Please try again later.';
      }
    }

    throw error;
  }
}