"use client";

import { ChangeEventHandler, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Upload, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { usePhotos } from "@/features/moments/hooks/use-photos";
import {
  useMessages,
  type BulletinMessage,
} from "@/features/moments/hooks/use-messages";
import { toast } from "sonner";
import ky from "ky";
import { PhotoUploadResponse } from "@/features/moments/models/responses";
import {
  MessageCreateRequest,
  PhotoUploadRequest,
} from "@/features/moments/models/requests";
import { env } from "@/lib/env";
import Autoplay from "embla-carousel-autoplay";
import AlertDialogButton from "@/components/ui/alert-dialog-button";

export default function Page() {
  const { key, photos, mutate: mutatePhotos } = usePhotos();
  const { messages, mutate: mutateMessages } = useMessages();
  const [isUploading, startUploading] = useTransition();
  const [api, setApi] = useState<CarouselApi>();
  const [isSending, startSending] = useTransition();
  const [newMessage, setNewMessage] = useState<string>("");

  const plugin = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true }),
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const daysTogether = useRef<number>(
    Math.trunc((Date.now() - Date.UTC(2022, 10, 1)) / (1000 * 60 * 60 * 24)),
  );

  const onPhotoUpload: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (!event.target.files?.length) {
      return;
    }
    const files = Array.from(event.target.files);

    startUploading(async () => {
      try {
        await mutatePhotos(
          async () => {
            const { photos: newPhotos, uploadUrls } = await ky
              .post(key, {
                json: {
                  imageNames: files.map((file) => file.name),
                } satisfies PhotoUploadRequest,
              })
              .json<PhotoUploadResponse>();

            await Promise.all(
              uploadUrls.map((url, index) =>
                ky.put(url, {
                  headers: { "Content-Type": files[index].type },
                  body: files[index],
                }),
              ),
            );

            return photos.concat(newPhotos);
          },
          {
            revalidate: false,
          },
        );

        toast.success("Photos uploaded successfully!");
      } catch (error) {
        console.error("Upload failed:", error);
        toast.error("Failed to upload photos");
      }
    });
  };

  const onPhotoDelete = async () => {
    if (photos.length === 0 || api === undefined) {
      return;
    }

    const currentIndex = api.selectedScrollSnap();
    const newPhotos = photos.filter((_, index) => index !== currentIndex);
    await mutatePhotos(
      async () => {
        await ky.delete(`${key}/${photos[currentIndex].photoId}`);
        return newPhotos;
      },
      {
        optimisticData: newPhotos,
        rollbackOnError: true,
      },
    );
  };

  const handleSendMessage = () => {
    const trimmedMessage = newMessage.trim();
    if (trimmedMessage.length === 0) {
      return;
    }

    startSending(async () => {
      try {
        await mutateMessages(async () => {
          const newMessage = await ky
            .post("/api/moments/messages", {
              json: { content: trimmedMessage } satisfies MessageCreateRequest,
            })
            .json<BulletinMessage>();

          return [...messages, newMessage];
        });
        setNewMessage("");
        toast.success("Message sent!");
      } catch (error) {
        console.error("Send failed:", error);
        toast.error("Failed to send message");
      }
    });
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600)
      return `${Math.floor(diffInSeconds / 60).toString()}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600).toString()}h ago`;
    if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days.toString()} day${days > 1 ? "s" : ""} ago`;
    }

    return date.toLocaleDateString();
  };

  return (
    <main className="flex-1 container mx-auto p-4 bg-background">
      <div className="grid grid-cols-1 xl:grid-cols-5 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {/* Photo Gallery Section */}
        <div className="xl:col-span-3 lg:col-span-2">
          <Card className="flex-auto pb-0 overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl sm:text-2xl font-bold text-foreground">
                  Photo Gallery
                </CardTitle>
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onPhotoUpload}
                    multiple
                    className="hidden"
                    ref={fileInput}
                  />

                  <Button
                    variant="default"
                    size="sm"
                    disabled={photos.length === 10 || isUploading}
                    className="bg-primary hover:bg-primary/90 cursor-pointer"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {isUploading ? "Uploading..." : "Upload"}
                    </span>
                  </Button>

                  <AlertDialogButton
                    buttonVariant="outline"
                    buttonSize="sm"
                    buttonClassName="cursor-pointer hover:text-destructive sm:flex"
                    disabled={photos.length === 0}
                    onConfirm={onPhotoDelete}
                    onOpen={() => {
                      plugin.current.stop();
                    }}
                    onClose={() => {
                      plugin.current.play();
                    }}
                    confirmButtonVariant="destructive"
                    alertTitle="Are you sure?"
                    alertDescription="You will delete the current photo on carousel. The action cannot be undone."
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Delete</span>
                  </AlertDialogButton>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Carousel plugins={[plugin.current]} setApi={setApi}>
                {photos.length > 0 ? (
                  <CarouselContent className="m-0">
                    {photos.map((photo, index) => (
                      <CarouselItem key={photo.photoId} className="p-0">
                        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                          <Image
                            src={`${env.NEXT_PUBLIC_R2_ENDPOINT}/carousel/${photo.imageKey}`}
                            alt={photo.imageKey.substring(
                              0,
                              photo.imageKey.lastIndexOf("-"),
                            )}
                            fill
                            sizes="(max-width: 768px) 80vw, (max-width: 1200px) 60vw, 50vw"
                            className="object-cover"
                            priority={index === 0}
                          />
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                ) : (
                  <div className="aspect-[4/3] border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50 m-6 rounded-xl">
                    <div className="text-center p-8">
                      <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground text-sm mb-2">
                        No photos yet. Upload some memories!
                      </p>
                    </div>
                  </div>
                )}
                {photos.length > 1 && (
                  <>
                    <CarouselPrevious className="left-4 bg-white/80 hover:bg-white border-0 shadow-md" />
                    <CarouselNext className="right-4 bg-white/80 hover:bg-white border-0 shadow-md" />
                  </>
                )}
              </Carousel>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2 lg:col-span-1 space-y-6">
          <Card className="text-center">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Days Together
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div
                className="text-5xl sm:text-6xl font-bold text-primary mb-2 leading-none"
                suppressHydrationWarning
              >
                {daysTogether.current}
              </div>
              <p className="text-sm text-muted-foreground">
                Since November 1, 2022
              </p>
            </CardContent>
          </Card>

          {/* Message Board */}
          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Message Board
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4 h-65 overflow-y-auto scrollbar-hide pr-2">
                {messages.length > 0 ? (
                  messages.map((message: BulletinMessage) => (
                    <div
                      key={message.messageId}
                      className="flex p-2 items-center gap-3"
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-border">
                        <AvatarImage
                          src={
                            message.authorImage
                              ? `${env.NEXT_PUBLIC_R2_ENDPOINT}/avatar/${message.authorImage}`
                              : undefined
                          }
                          alt={message.author}
                        />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
                          {message.author[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {message.author}
                          </span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatTimeAgo(message.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed break-words">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <div className="text-muted-foreground/50 mb-3">
                      <Send className="h-8 w-8 mx-auto" />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      No messages yet. Start the conversation!
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t border-border">
                <Input
                  name="message-input"
                  placeholder="Write a message..."
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      handleSendMessage();
                    }
                  }}
                  className="flex-1"
                  disabled={isSending}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={newMessage.trim().length === 0 || isSending}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 px-4"
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {isSending ? "Sending..." : "Send"}
                  </span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
