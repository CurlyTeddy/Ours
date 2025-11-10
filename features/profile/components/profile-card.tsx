"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  UncontrolledFormField,
  RegisteredFormControl,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import ky from "ky";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod/v4";
import { Trash2, User, Mail, Save, Camera } from "lucide-react";
import {
  Profile,
  ProfileUpdateResponse,
} from "@/features/profile/models/responses";
import { useUser } from "@/features/profile/hooks/user";
import { Skeleton } from "@/components/ui/skeleton";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.email("Invalid email address"),
  image: z.file().nullable(),
});

function ProfileSkeleton() {
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

function ProfileCard({ user }: { user: Profile }) {
  const { mutate } = useUser();
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isObjectUrl = useRef<boolean>(false);
  const [preview, setPreview] = useState<string>();
  const [name, setName] = useState<string>(user.name);

  const form = useForm<z.infer<typeof profileSchema>>({
    defaultValues: async () => {
      if (user.imageKey === null || user.imageUrl === null) {
        return {
          name: name,
          email: user.email,
          image: null,
        };
      }

      const blob = await ky.get(user.imageUrl).blob();
      setPreview(user.imageUrl);
      return {
        name: name,
        email: user.email,
        image: new File([blob], user.imageKey, { type: blob.type }),
      };
    },
    resolver: zodResolver(profileSchema),
  });

  useEffect(() => {
    return () => {
      if (preview != undefined && isObjectUrl.current) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const onSubmit = (formData: z.infer<typeof profileSchema>) => {
    startTransition(async () => {
      try {
        const { profile, signedUrl } = await ky
          .put<ProfileUpdateResponse>(`/api/profile`, {
            json: {
              name: formData.name,
              email: formData.email,
              image: formData.image ? formData.image.name : null,
            },
          })
          .json();

        if (formData.image && signedUrl) {
          await ky.put(signedUrl, {
            headers: { "Content-Type": formData.image.type },
            body: formData.image,
          });
        }

        setName(profile.name);
        await mutate({ ...profile }, { revalidate: false });
        toast.success("Profile updated successfully!");
      } catch {
        toast.error("Failed to update profile");
      }
    });
  };

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
          <Form {...form}>
            <form
              onSubmit={(e) => {
                void form.handleSubmit(onSubmit)(e);
              }}
              className="space-y-8"
            >
              {/* Avatar Section */}
              <FormField<z.infer<typeof profileSchema>, "image">
                name="image"
                render={({ field: { onChange, name: imageName } }) => {
                  return (
                    <div className="space-y-6">
                      <div className="flex flex-col items-center space-y-6">
                        <div className="relative group">
                          <Avatar className="size-32 ring-4 ring-primary/10 transition-all">
                            <AvatarImage
                              src={preview}
                              alt={imageName}
                              className="object-cover"
                            />
                            <AvatarFallback className="text-3xl font-semibold bg-gradient-to-br from-primary/10 to-primary/20 text-primary">
                              {name[0].toUpperCase()}
                            </AvatarFallback>
                            <div
                              className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-50 group-hover:ring-primary/20 transition-opacity duration-300 flex items-center justify-center cursor-pointer"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Camera className="w-8 h-8 text-white" />
                            </div>
                          </Avatar>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            form.setValue("image", null);
                            setPreview(undefined);
                            if (preview !== undefined && isObjectUrl.current) {
                              URL.revokeObjectURL(preview);
                            }
                          }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </Button>

                        <p className="text-sm text-muted-foreground text-center max-w-xs">
                          Recommended: Square image, up to 10MB
                        </p>
                      </div>

                      <FormItem className="hidden">
                        <FormLabel>Image</FormLabel>
                        <FormControl>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              if (
                                !event.target.files ||
                                event.target.files.length === 0
                              ) {
                                return;
                              }
                              const newImage = event.target.files[0];
                              setPreview(URL.createObjectURL(newImage));
                              isObjectUrl.current = true;
                              onChange(newImage);
                            }}
                            className="hidden"
                          />
                        </FormControl>
                      </FormItem>
                    </div>
                  );
                }}
              />

              <Separator />

              {/* Form Fields */}
              <div className="space-y-6">
                <UncontrolledFormField name="name">
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Full Name
                    </FormLabel>
                    <RegisteredFormControl>
                      <Input
                        autoComplete="name"
                        placeholder="Enter your full name"
                      />
                    </RegisteredFormControl>
                    <FormMessage />
                  </FormItem>
                </UncontrolledFormField>

                <UncontrolledFormField name="email">
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Email Address
                    </FormLabel>
                    <RegisteredFormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="Enter your email address"
                      />
                    </RegisteredFormControl>
                    <FormMessage />
                  </FormItem>
                </UncontrolledFormField>
              </div>

              <Separator />

              {/* Save Button */}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  aria-disabled={isPending}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}

export { ProfileSkeleton, ProfileCard };
