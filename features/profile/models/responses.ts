interface Profile {
  name: string;
  email: string;
  imageKey: string | null;
  imageUrl: string | null;
}

interface ProfileUpdateResponse {
  profile: Profile;
  signedUrl?: string;
}

export type { Profile, ProfileUpdateResponse };
