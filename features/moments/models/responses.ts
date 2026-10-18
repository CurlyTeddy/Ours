interface Photo {
  photoId: string;
  imageKey: string;
  imageUrl: string;
  createdAt: string;
}

interface PhotoResponse {
  photos: Photo[];
}

interface PhotoUploadResponse {
  photos: Photo[];
  uploadUrls: string[];
}

interface BulletinMessage {
  messageId: string;
  content: string;
  createdAt: string;
  updateAt: string;
  author: string;
  authorImage: string | null;
}

interface BulletinMessageResponse {
  messages: BulletinMessage[];
  nextCursor: string | null;
  totalCount: number;
}

interface SpecialDay {
  specialDayId: string;
  name: string;
  month: number;
  day: number;
  createdAt: string;
}

interface SpecialDayResponse {
  specialDays: SpecialDay[];
}

export type {
  Photo,
  PhotoResponse,
  PhotoUploadResponse,
  BulletinMessage,
  BulletinMessageResponse,
  SpecialDay,
  SpecialDayResponse,
};
