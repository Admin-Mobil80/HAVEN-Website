import { GetObjectCommand, PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { MediaStore } from "../http/media.js";

// Recordings (Priya's voice replies, digest voice notes) in the private media bucket. The browser
// never gets bucket access: /api/media/:key checks Haven's own signature, then redirects to a
// 5-minute presigned GET (S3 serves the byte ranges Safari needs for <audio>).
export class S3MediaStore implements MediaStore {
  private readonly s3: S3Client;

  constructor(private readonly bucket: string, config: S3ClientConfig = {}) {
    this.s3 = new S3Client({ region: process.env.AWS_REGION ?? "ap-south-1", ...config });
  }

  async put(key: string, data: Buffer, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
  }

  async getBytes(key: string): Promise<Buffer | undefined> {
    try {
      const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return out.Body ? Buffer.from(await out.Body.transformToByteArray()) : undefined;
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return undefined;
      throw err;
    }
  }

  async signedGetUrl(key: string) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 300 });
  }
}

// Demo households' objects live under demo/ so the bucket lifecycle rule expires them after 7 days.
export const mediaKey = (householdId: string, demo: boolean, name: string) => `${demo ? "demo/" : ""}hh/${householdId}/${name}`;
