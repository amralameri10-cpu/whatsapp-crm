import {
  cleanDisplayName,
  isWhatsAppJid,
  jidToPhone,
  phoneToJid,
  pickWhatsAppJid,
} from '@/lib/utils';

export type NormalizedMessageContent = {
  text: string | null;
  messageType: string;
  mediaUrl: string | null;
  mediaMimetype: string | null;
  mediaCaption: string | null;
  quotedMessageId: string | null;
  quotedText: string | null;
};

export function recordsFromEvolution(payload: any): any[] {
  const candidates = [
    payload,
    payload?.records,
    payload?.messages,
    payload?.messages?.records,
    payload?.data,
    payload?.data?.records,
    payload?.data?.messages,
    payload?.chats,
    payload?.contacts,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function getChatRemoteJid(chat: any): string | null {
  return pickWhatsAppJid(
    chat?.remoteJid,
    chat?.key?.remoteJid,
    chat?.lastMessage?.key?.remoteJid,
    chat?.lastMessage?.remoteJid,
    chat?.conversation?.remoteJid,
    chat?.id,
  );
}

export function getContactRemoteJid(contact: any): string | null {
  const jid = pickWhatsAppJid(
    contact?.remoteJid,
    contact?.jid,
    contact?.key?.remoteJid,
    contact?.id,
  );
  if (jid) return jid;

  const rawNumber = String(contact?.number || contact?.phone || '').replace(/\D/g, '');
  return rawNumber.length >= 5 ? phoneToJid(rawNumber) : null;
}

export function getEvolutionName(value: any, fallback?: any): string | null {
  return cleanDisplayName(
    value?.pushName,
    value?.verifiedName,
    value?.notify,
    value?.subject,
    value?.formattedName,
    value?.shortName,
    value?.displayName,
    value?.name,
    value?.contact?.pushName,
    value?.contact?.name,
    fallback?.pushName,
    fallback?.verifiedName,
    fallback?.notify,
    fallback?.subject,
    fallback?.formattedName,
    fallback?.shortName,
    fallback?.displayName,
    fallback?.name,
  );
}

export function getEvolutionPhone(value: any, remoteJid?: string | null): string {
  const candidates = [value?.number, value?.phone, value?.phoneNumber];
  for (const candidate of candidates) {
    const digits = String(candidate || '').replace(/\D/g, '');
    if (digits.length >= 5) return digits;
  }
  return remoteJid ? jidToPhone(remoteJid) : '';
}

export function getMessageRemoteJid(message: any): string | null {
  return pickWhatsAppJid(
    message?.key?.remoteJid,
    message?.remoteJid,
    message?.key?.remoteJidAlt,
    message?.remoteJidAlt,
  );
}

export function messageTimestamp(message: any): Date {
  const raw = message?.messageTimestamp ?? message?.timestamp ?? message?.createdAt;
  let numeric: number | null = null;

  if (typeof raw === 'number') numeric = raw;
  else if (typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw)) numeric = Number(raw);
  else if (raw && typeof raw === 'object' && typeof raw.low === 'number') numeric = raw.low;

  if (numeric !== null && Number.isFinite(numeric)) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const parsed = new Date(milliseconds);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

function unwrapMessage(message: any): any {
  let current = message || {};
  for (let depth = 0; depth < 5; depth++) {
    const wrapped =
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.viewOnceMessageV2Extension?.message ||
      current?.documentWithCaptionMessage?.message ||
      current?.editedMessage?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current;
}

function mediaSource(container: any, root: any, mimetype: string): string | null {
  const raw = container?.base64 || root?.base64 || container?.url || null;
  if (typeof raw !== 'string' || !raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.length < 100) return null;
  return `data:${mimetype};base64,${raw}`;
}

function quotedData(contextInfo: any) {
  const quoted = unwrapMessage(contextInfo?.quotedMessage || {});
  const quotedText =
    quoted?.conversation ||
    quoted?.extendedTextMessage?.text ||
    quoted?.imageMessage?.caption ||
    quoted?.videoMessage?.caption ||
    quoted?.documentMessage?.fileName ||
    null;
  return {
    quotedMessageId: contextInfo?.stanzaId || null,
    quotedText: quotedText ? String(quotedText) : null,
  };
}

export function normalizeMessageContent(messageRecord: any): NormalizedMessageContent {
  const root = messageRecord?.message || messageRecord?.content || {};
  const m = unwrapMessage(root);
  let text: string | null = null;
  let messageType = 'text';
  let mediaUrl: string | null = null;
  let mediaMimetype: string | null = null;
  let mediaCaption: string | null = null;
  let contextInfo: any = null;

  if (m.conversation) {
    text = String(m.conversation);
  } else if (m.extendedTextMessage) {
    text = m.extendedTextMessage.text || null;
    contextInfo = m.extendedTextMessage.contextInfo;
  } else if (m.imageMessage) {
    messageType = 'image';
    mediaMimetype = m.imageMessage.mimetype || 'image/jpeg';
    mediaCaption = m.imageMessage.caption || null;
    text = mediaCaption;
    mediaUrl = mediaSource(m.imageMessage, root, mediaMimetype);
    contextInfo = m.imageMessage.contextInfo;
  } else if (m.videoMessage) {
    messageType = 'video';
    mediaMimetype = m.videoMessage.mimetype || 'video/mp4';
    mediaCaption = m.videoMessage.caption || null;
    text = mediaCaption;
    mediaUrl = mediaSource(m.videoMessage, root, mediaMimetype);
    contextInfo = m.videoMessage.contextInfo;
  } else if (m.audioMessage) {
    messageType = 'audio';
    mediaMimetype = m.audioMessage.mimetype || 'audio/ogg';
    mediaUrl = mediaSource(m.audioMessage, root, mediaMimetype);
    contextInfo = m.audioMessage.contextInfo;
  } else if (m.documentMessage) {
    messageType = 'document';
    mediaMimetype = m.documentMessage.mimetype || 'application/octet-stream';
    mediaCaption = m.documentMessage.fileName || m.documentMessage.title || null;
    text = mediaCaption;
    mediaUrl = mediaSource(m.documentMessage, root, mediaMimetype);
    contextInfo = m.documentMessage.contextInfo;
  } else if (m.stickerMessage) {
    messageType = 'sticker';
    mediaMimetype = m.stickerMessage.mimetype || 'image/webp';
    mediaUrl = mediaSource(m.stickerMessage, root, mediaMimetype);
    contextInfo = m.stickerMessage.contextInfo;
  } else if (m.reactionMessage) {
    messageType = 'reaction';
    text = m.reactionMessage.text || null;
  } else if (m.buttonsResponseMessage) {
    text = m.buttonsResponseMessage.selectedDisplayText || m.buttonsResponseMessage.selectedButtonId || null;
  } else if (m.templateButtonReplyMessage) {
    text = m.templateButtonReplyMessage.selectedDisplayText || m.templateButtonReplyMessage.selectedId || null;
  } else if (m.listResponseMessage) {
    text = m.listResponseMessage.title || m.listResponseMessage.singleSelectReply?.selectedRowId || null;
  } else if (m.interactiveResponseMessage) {
    text = m.interactiveResponseMessage.body?.text || m.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson || null;
  } else if (m.locationMessage) {
    messageType = 'location';
    text = m.locationMessage.comment || m.locationMessage.name || 'موقع';
  } else if (m.liveLocationMessage) {
    messageType = 'location';
    text = m.liveLocationMessage.caption || 'موقع مباشر';
  } else if (m.contactMessage) {
    messageType = 'contact';
    text = m.contactMessage.displayName || 'جهة اتصال';
  } else if (m.contactsArrayMessage) {
    messageType = 'contact';
    text = m.contactsArrayMessage.displayName || `${m.contactsArrayMessage.contacts?.length || ''} جهات اتصال`.trim();
  } else if (m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3) {
    const poll = m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3;
    messageType = 'poll';
    text = poll.name || 'استطلاع';
  } else if (m.protocolMessage) {
    messageType = 'protocol';
  } else if (m.senderKeyDistributionMessage) {
    messageType = 'protocol';
  } else {
    const firstType = Object.keys(m)[0];
    if (firstType) messageType = firstType.replace(/Message$/, '').toLowerCase() || 'unknown';
  }

  const quoted = quotedData(contextInfo);
  return {
    text: text !== null ? String(text) : null,
    messageType,
    mediaUrl,
    mediaMimetype,
    mediaCaption,
    ...quoted,
  };
}

export function isSameConversation(message: any, remoteJid: string): boolean {
  const candidate = getMessageRemoteJid(message);
  if (!candidate) return false;
  if (candidate === remoteJid) return true;
  // Some Evolution builds expose both the phone JID and a LID alias.
  if (candidate.endsWith('@lid') || remoteJid.endsWith('@lid')) {
    const alternate = pickWhatsAppJid(message?.key?.remoteJidAlt, message?.remoteJidAlt);
    return alternate === remoteJid;
  }
  return false;
}

export function contactLookupKeys(contact: any): string[] {
  const values = [
    getContactRemoteJid(contact),
    contact?.remoteJid,
    contact?.jid,
    contact?.id,
    contact?.lid,
  ].filter((value): value is string => typeof value === 'string' && !!value);
  return Array.from(new Set(values.map((value) => value.toLowerCase())));
}

export function usableContact(contact: any): boolean {
  const jid = getContactRemoteJid(contact);
  const phone = getEvolutionPhone(contact, jid);
  return !!jid || phone.length >= 5;
}

export function contactJidFromPhone(contact: any): string | null {
  const phone = getEvolutionPhone(contact, null);
  return phone ? phoneToJid(phone) : null;
}

export function isGroupJid(remoteJid: string): boolean {
  return isWhatsAppJid(remoteJid) && remoteJid.endsWith('@g.us');
}
