import { db, uid, childrenOf } from '../db.js';

export async function addAttachment(parentType, parentId, file, caption = '') {
  const record = {
    id: uid(),
    parentType,
    parentId,
    blob: file,
    mimeType: file.type || 'application/octet-stream',
    caption,
    createdAt: new Date().toISOString(),
  };
  const d = await db();
  await d.put('attachments', record);
  return record;
}

export async function listAttachments(parentType, parentId) {
  return childrenOf('attachments', parentType, parentId);
}

export async function deleteAttachment(id) {
  const d = await db();
  await d.delete('attachments', id);
}

export function objectUrl(attachment) {
  if (!attachment || !attachment.blob) return '';
  return URL.createObjectURL(attachment.blob);
}

export function revokeUrls(urls) {
  for (const u of urls) URL.revokeObjectURL(u);
}
