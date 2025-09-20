interface Photo {
  photoId: string;
  imageKey: string;
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
}

export type {
  Photo,
  PhotoResponse,
  PhotoUploadResponse,
  BulletinMessage,
  BulletinMessageResponse,
};
