import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/database-client";
import s3Client from "@/lib/s3-client";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createId } from "@paralleldrive/cuid2";
import { HttpErrorPayload } from "@/lib/error";
import z from "zod";
import { env } from "@/lib/env";
import {
  PhotoResponse,
  PhotoUploadResponse,
} from "@/features/moments/models/responses";
import { PhotoUploadRequest } from "@/features/moments/models/requests";
import { urlCache, urlTimeout } from "@/lib/timed-cache";
import assert from "node:assert";

async function GET(): Promise<NextResponse<PhotoResponse | HttpErrorPayload>> {
  try {
    const photos = await prisma.momentPhoto.findMany({
      orderBy: { createdAt: "asc" },
    });

    for (const photo of photos) {
      if (!urlCache.has(photo.imageKey)) {
        urlCache.set(
          photo.imageKey,
          await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
              Key: `carousel/${photo.imageKey}`,
            }),
            {
              expiresIn: urlTimeout,
            },
          ),
        );
      }
    }

    return NextResponse.json({
      photos: await Promise.all(
        photos.map(async (photo) => {
          const cachedUrl = urlCache.get(photo.imageKey)?.value;
          assert(
            cachedUrl !== undefined,
            "Cached for photos must be set before returning response.",
          );
          return {
            photoId: photo.photoId,
            imageKey: photo.imageKey,
            imageUrl: cachedUrl,
            createdAt: photo.createdAt.toISOString(),
          };
        }),
      ),
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to fetch photos" },
      { status: 500 },
    );
  }
}

/**
 * @summary
 * Create a list of memory photos.
 *
 * @description
 * The order of the returned URLs need to match the order of the image names passed to the API.
 *
 * @returns Signed URLs for frontend to upload each photo.
 */
async function POST(
  request: NextRequest,
): Promise<NextResponse<PhotoUploadResponse | HttpErrorPayload>> {
  try {
    const body = (await request.json()) as PhotoUploadRequest;
    const validatedFields = z
      .object({
        imageNames: z.array(z.string()).min(1).max(10),
      })
      .safeParse(body);

    if (!validatedFields.success) {
      return NextResponse.json(
        { message: "Invalid request data" },
        { status: 400 },
      );
    }

    const { imageNames } = validatedFields.data;
    const imageKeys = imageNames.map((name) => `${name}-${createId()}`);

    const photos = await prisma.$transaction(async (txn) => {
      const photoCount = await txn.momentPhoto.count();
      if (photoCount + imageKeys.length >= 10) {
        return null;
      }

      return await txn.momentPhoto.createManyAndReturn({
        data: imageKeys.map((imageKey) => ({
          imageKey,
        })),
      });
    });

    if (photos === null) {
      return NextResponse.json(
        { message: "Maximum 10 photos allowed" },
        { status: 400 },
      );
    }

    const uploadUrls = await Promise.all(
      imageKeys.map((imageKey) =>
        getSignedUrl(
          s3Client,
          new PutObjectCommand({
            Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
            Key: `carousel/${imageKey}`,
            ContentType: "image/*",
          }),
          {
            expiresIn: urlTimeout,
          },
        ),
      ),
    );

    for (const photo of photos) {
      if (!urlCache.has(photo.imageKey)) {
        urlCache.set(
          photo.imageKey,
          await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
              Key: `carousel/${photo.imageKey}`,
            }),
            {
              expiresIn: urlTimeout,
            },
          ),
        );
      }
    }

    return NextResponse.json({
      photos: await Promise.all(
        photos.map(async (photo) => {
          const cachedUrl = urlCache.get(photo.imageKey)?.value;
          assert(
            cachedUrl !== undefined,
            "Cached for photos must be set before returning response.",
          );
          return {
            ...photo,
            imageUrl: cachedUrl,
            createdAt: photo.createdAt.toISOString(),
          };
        }),
      ),
      uploadUrls,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to create photo upload" },
      { status: 500 },
    );
  }
}

export { GET, POST };
