export const CHAT_ATTACHMENT_ACCEPT = "*/*";

export function isImageChatAttachmentMimeType(mimeType: string | null | undefined): boolean {
  return typeof mimeType === "string" && mimeType.startsWith("image/");
}
