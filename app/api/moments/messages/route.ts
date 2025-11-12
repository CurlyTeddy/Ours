import { NextRequest, NextResponse } from "next/server";
import { validateSessionToken } from "@/features/auth/session";
import { cookies } from "next/headers";
import prisma from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import z from "zod";
import {
  BulletinMessage,
  BulletinMessageResponse,
} from "@/features/moments/models/responses";
import { MessageCreateRequest } from "@/features/moments/models/requests";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Client from "@/lib/s3-client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { urlCache, urlTimeout } from "@/lib/timed-cache";

async function GET(): Promise<
  NextResponse<BulletinMessageResponse | HttpErrorPayload>
> {
  try {
    const messages = await prisma.bulletinMessage.findMany({
      include: {
        author: {
          select: {
            name: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    for (const message of messages) {
      if (
        message.author.image !== null &&
        !urlCache.has(message.author.image)
      ) {
        urlCache.set(
          message.author.image,
          await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
              Key: `avatar/${message.author.image}`,
            }),
            {
              expiresIn: urlTimeout,
            },
          ),
        );
      }
    }

    return NextResponse.json({
      messages: messages.map((message) => ({
        messageId: message.messageId,
        createdAt: message.createdAt.toISOString(),
        updateAt: message.updatedAt.toISOString(),
        content: message.content,
        author: message.author.name,
        authorImage: urlCache.get(message.author.image ?? "")?.value ?? null,
      })),
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}

async function POST(
  request: NextRequest,
): Promise<NextResponse<BulletinMessage | HttpErrorPayload>> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;
  const { user } = await validateSessionToken(sessionToken);

  if (!user) {
    return NextResponse.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as MessageCreateRequest;
    const validatedFields = z
      .object({
        content: z.string().min(1).max(500),
      })
      .safeParse(body);

    if (!validatedFields.success) {
      return NextResponse.json(
        { message: "Invalid message content" },
        { status: 400 },
      );
    }

    const { content } = validatedFields.data;

    const message = await prisma.bulletinMessage.create({
      data: {
        content,
        authorId: user.id,
      },
      include: {
        author: {
          select: {
            name: true,
            image: true,
          },
        },
      },
    });

    if (message.author.image !== null && !urlCache.has(message.author.image)) {
      urlCache.set(
        message.author.image,
        await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
            Key: `avatar/${message.author.image}`,
          }),
          {
            expiresIn: urlTimeout,
          },
        ),
      );
    }

    return NextResponse.json({
      messageId: message.messageId,
      createdAt: message.createdAt.toISOString(),
      updateAt: message.updatedAt.toISOString(),
      content: message.content,
      author: message.author.name,
      authorImage: urlCache.get(message.author.image ?? "")?.value ?? null,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to create message" },
      { status: 500 },
    );
  }
}

export { GET, POST };
