import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { User } from "lucide-react";

export default function ProfileSkeleton() {
  return (
    <main className="my-auto bg-background p-4">
      <Card className="mx-auto max-w-2xl pt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-6 h-6" />
            Personal Information
          </CardTitle>
          <CardDescription>
            Update your profile picture and personal details
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-8">
          <div className="space-y-6">
            <div className="flex flex-col items-center space-y-6">
              <Skeleton className="size-32 rounded-full" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-4 w-60" />
            </div>
          </div>

          <Separator />

          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>

          <Separator />

          <div className="flex justify-end">
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
