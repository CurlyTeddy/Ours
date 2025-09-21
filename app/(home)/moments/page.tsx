"use client";

import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhotoGallery } from "@/features/moments/components/photo-gallery";
import { MessageBoard } from "@/features/moments/components/message-board";

export default function Page() {
  const daysTogether = useRef<number>(
    Math.trunc((Date.now() - Date.UTC(2022, 10, 1)) / (1000 * 60 * 60 * 24)),
  );

  return (
    <main className="flex-1 container mx-auto p-4 bg-background">
      <div className="grid grid-cols-1 xl:grid-cols-5 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {/* Photo Gallery Section */}
        <div className="xl:col-span-3 lg:col-span-2">
          <PhotoGallery />
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
          <MessageBoard />
        </div>
      </div>
    </main>
  );
}
