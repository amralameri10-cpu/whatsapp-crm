export type ChatListItem = {
  id: number;
  remoteJid: string;
  name: string | null;
  phoneNumber: string | null;
  isGroup: boolean;
  assignedUserId: number | null;
  assignedUserName?: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  lastMessageFromMe: boolean;
  unreadCount: number;
  isOpen: boolean;
  requireApproval: boolean;
  aiEnabled: boolean;
  instanceId: number;
  instanceName?: string;
};

export type MessageItem = {
  id: string;
  chatId: number;
  fromMe: boolean;
  senderName: string | null;
  messageType: string;
  text: string | null;
  mediaUrl: string | null;
  mediaMimetype: string | null;
  mediaCaption: string | null;
  quotedMessageId: string | null;
  quotedText: string | null;
  status: string;
  isInternal: boolean;
  timestamp: string;
};

export type PendingMessageItem = {
  id: number;
  chatId: number;
  authorId: number | null;
  authorName?: string | null;
  text: string;
  source: 'agent' | 'ai';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

export type InstanceItem = {
  id: number;
  instanceName: string;
  displayName: string | null;
  phoneNumber: string | null;
  status: string;
  profilePicUrl: string | null;
};
