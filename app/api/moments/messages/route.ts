import { NextRequest, NextResponse } from "next/server";
import { validateSessionToken } from "@/features/auth/session";
import { cookies } from "next/headers";
import { prisma } from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import z from "zod";
import {
  BulletinMessage,
  BulletinMessageResponse,
} from "@/features/moments/models/responses";
import { MessageCreateRequest } from "@/features/moments/models/requests";
import { getCachedSignedUrl } from "@/lib/s3-client";
import s3Client from "@/lib/s3-client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

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

    return NextResponse.json({
      messages: await Promise.all(
        messages.map(async (message) => ({
          messageId: message.messageId,
          createdAt: message.createdAt.toISOString(),
          updateAt: message.updatedAt.toISOString(),
          content: message.content,
          author: message.author.name,
          authorImage:
            message.author.image !== null
              ? await getCachedSignedUrl(
                  s3Client,
                  new GetObjectCommand({
                    Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
                    Key: `avatar/${message.author.image}`,
                  }),
                )
              : null,
        })),
      ),
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

    return NextResponse.json({
      messageId: message.messageId,
      createdAt: message.createdAt.toISOString(),
      updateAt: message.updatedAt.toISOString(),
      content: message.content,
      author: message.author.name,
      authorImage:
        message.author.image !== null
          ? await getCachedSignedUrl(
              s3Client,
              new GetObjectCommand({
                Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
                Key: `avatar/${message.author.image}`,
              }),
            )
          : null,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to create message" },
      { status: 500 },
    );
  }
}

export { GET, POST };
