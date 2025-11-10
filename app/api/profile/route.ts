import { validateSessionToken } from "@/features/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { HttpErrorPayload } from "@/lib/error";
import {
  Profile,
  ProfileUpdateResponse,
} from "@/features/profile/models/responses";
import z from "zod";
import prisma from "@/lib/database-client";
import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import s3Client from "@/lib/s3-client";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function GET(
  request: NextRequest,
): Promise<NextResponse<Profile | HttpErrorPayload>> {
  try {
    const sessionToken = request.cookies.get("session")?.value;

    const { session, user } = await validateSessionToken(sessionToken);

    if (!session || !user) {
      return NextResponse.json(
        { message: "Invalid or expired session." },
        { status: 401 },
      );
    }

    return NextResponse.json({
      name: user.name,
      email: user.email,
      imageKey: user.image,
      imageUrl:
        user.image !== null
          ? await getSignedUrl(
              s3Client,
              new GetObjectCommand({
                Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
                Key: `avatar/${user.image}`,
              }),
              {
                expiresIn: 300,
              },
            )
          : null,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { message: "Failed to fetch user information" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
): Promise<NextResponse<ProfileUpdateResponse | HttpErrorPayload>> {
  const cookiesStore = await cookies();
  const { user } = await validateSessionToken(
    cookiesStore.get("session")?.value,
  );

  if (user === null) {
    return NextResponse.json(
      { message: "Invalid or expired session." },
      { status: 401 },
    );
  }

  try {
    const requestPayload = (await request.json()) as {
      name: string;
      email: string;
      image?: string;
    };

    const validatedFields = z
      .object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email address"),
        image: z.string().nullable(),
      })
      .safeParse(requestPayload);

    if (!validatedFields.success) {
      return NextResponse.json(
        { message: validatedFields.error.issues[0].message },
        { status: 400 },
      );
    }

    const { name, email, image } = validatedFields.data;

    const currentImage =
      (
        await prisma.user.findUnique({
          where: { userId: user.id },
          select: { image: true },
        })
      )?.image ?? null;

    const bucket = `images-${env.NEXT_PUBLIC_ENVIRONMENT}`;

    if (image === currentImage) {
      const profile = await prisma.user.update({
        where: { userId: user.id },
        data: { name, email },
        select: { name: true, email: true, image: true },
      });
      revalidatePath(`/profile`);
      return NextResponse.json(
        {
          profile: {
            name: profile.name,
            email: profile.email,
            imageKey: image,
            imageUrl: image
              ? await getSignedUrl(
                  s3Client,
                  new GetObjectCommand({
                    Bucket: bucket,
                    Key: `avatar/${image}`,
                  }),
                )
              : null,
          },
        },
        { status: 200 },
      );
    }

    const payload = await prisma.$transaction(async (txn) => {
      const imageKey = image !== null ? `${image}-${createId()}` : null;

      const profile = await txn.user.update({
        where: { userId: user.id },
        data: { name, email, image: imageKey },
        select: { name: true, email: true, image: true },
      });

      const signedUrl =
        imageKey !== null
          ? await getSignedUrl(
              s3Client,
              new PutObjectCommand({
                Bucket: bucket,
                Key: `avatar/${imageKey}`,
              }),
            )
          : undefined;

      if (currentImage !== null) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: `avatar/${currentImage}`,
          }),
        );
      }

      return {
        profile: {
          name: profile.name,
          email: profile.email,
          imageKey: profile.image,
          imageUrl: profile.image
            ? await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                  Bucket: bucket,
                  Key: `avatar/${profile.image}`,
                }),
              )
            : null,
        },
        signedUrl,
      };
    });

    revalidatePath(`/profile`);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { message: "Failed to update profile. Please try again later." },
      { status: 500 },
    );
  }
}
