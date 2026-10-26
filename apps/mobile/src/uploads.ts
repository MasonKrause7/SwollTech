import type { ApiClient } from "@swolltech/api-client";
import { File, UploadType } from "expo-file-system";
import { markUpload, pendingUploads, type Notebook } from "./db";

/** Upload set videos that were filmed offline. A failed upload stays queued. */
export async function drainUploads(db: Notebook, client: ApiClient) {
  const pending = await pendingUploads(db);
  for (const item of pending) {
    const file = new File(item.local_uri);
    if (!file.exists || !file.size) {
      await markUpload(db, item.id, "failed");
      continue;
    }
    try {
      const ticket = await client.uploadUrl(item.set_id, { content_type: item.content_type, byte_size: file.size });
      await file.upload(ticket.upload_url, { httpMethod: "PUT", uploadType: UploadType.BINARY_CONTENT, headers: ticket.headers });
      await client.confirmMedia(item.set_id);
      await markUpload(db, item.id, "ready");
    } catch (error) {
      const status = (error as { status?: number }).status;
      // 404 means the set never reached the server yet. Try again after the next sync.
      if (status && status !== 404 && status < 500) await markUpload(db, item.id, "failed");
    }
  }
}
