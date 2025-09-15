interface ProfileResponse {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface ProfileUpdateResponse {
  profile: {
    name: string;
    email: string;
    image: string | null;
  };
  signedUrl?: string;
}

export type { ProfileResponse, ProfileUpdateResponse };
