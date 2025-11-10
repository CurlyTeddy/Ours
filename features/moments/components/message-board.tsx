"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  useMessages,
  type BulletinMessage,
} from "@/features/moments/hooks/use-messages";
import { toast } from "sonner";
import ky from "ky";
import { MessageCreateRequest } from "@/features/moments/models/requests";
import { Skeleton } from "@/components/ui/skeleton";
import { DateTime } from "luxon";
import { useTimeZone } from "@/components/providers/time-zone";
import { formatTime } from "@/lib/utils";

function MessageBoardSkeleton() {
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Message Board</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4 h-65 overflow-y-auto scrollbar-hide pr-2">
          {/* Skeleton messages */}
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex p-2 items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-4 w-full max-w-48" />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-4 border-t border-border">
          <Skeleton className="flex-1 h-10" />
          <Skeleton className="h-9 w-9 sm:h-10 sm:w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export function MessageBoard() {
  const { messages, mutate: mutateMessages, isLoading } = useMessages();
  const [isSending, startSending] = useTransition();
  const [newMessage, setNewMessage] = useState<string>("");

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const timezone = useTimeZone();

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

  if (isLoading) {
    return <MessageBoardSkeleton />;
  }

  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Message Board</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          ref={messagesContainerRef}
          className="space-y-4 h-65 overflow-y-auto scrollbar-hide pr-2"
        >
          {messages.length > 0 ? (
            messages.map((message: BulletinMessage) => {
              const secondsBetween =
                (Date.now() - new Date(message.createdAt).getTime()) / 1000;
              return (
                <div
                  key={message.messageId}
                  className="flex p-2 items-center gap-3"
                >
                  <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-border">
                    <AvatarImage
                      src={
                        message.authorImage ? message.authorImage : undefined
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
                        {secondsBetween > 604800
                          ? DateTime.fromISO(message.createdAt, {
                              zone: timezone,
                            }).toFormat("yyyy-MM-dd")
                          : `${formatTime(secondsBetween)} ago`}
                      </span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed break-words">
                      {message.content}
                    </p>
                  </div>
                </div>
              );
            })
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
  );
}
