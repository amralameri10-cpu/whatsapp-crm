import {
  pgTable, serial, text, varchar, boolean, integer,
  timestamp, jsonb, index, unique
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'), // 'admin' | 'member'
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Team (single) ───────────────────────────────────────────────────────────
export const team = pgTable('team', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().default('My Company'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Team Members ─────────────────────────────────────────────────────────────
export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  teamId: integer('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default('agent'), // 'owner' | 'admin' | 'agent'
  // Permissions
  canSeePhone: boolean('can_see_phone').notNull().default(false),
  requireApproval: boolean('require_approval').notNull().default(false), // رد يحتاج موافقة
  canUseAI: boolean('can_use_ai').notNull().default(false),
  canViewAllChats: boolean('can_view_all_chats').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ uniq: unique().on(t.userId, t.teamId) }));

// ─── WhatsApp Instances ───────────────────────────────────────────────────────
export const instances = pgTable('instances', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
  instanceName: text('instance_name').notNull().unique(),
  displayName: text('display_name'),
  accessToken: text('access_token'),
  phoneNumber: varchar('phone_number', { length: 30 }),
  profilePicUrl: text('profile_pic_url'),
  status: varchar('status', { length: 20 }).notNull().default('disconnected'), // 'open'|'connecting'|'disconnected'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Chats ────────────────────────────────────────────────────────────────────
export const chats = pgTable('chats', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
  instanceId: integer('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
  remoteJid: text('remote_jid').notNull(),
  name: text('name'),
  phoneNumber: text('phone_number'), // مخفي عن الـ agents
  isGroup: boolean('is_group').notNull().default(false),
  assignedUserId: integer('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  lastMessageText: text('last_message_text'),
  lastMessageAt: timestamp('last_message_at'),
  lastMessageFromMe: boolean('last_message_from_me').default(false),
  unreadCount: integer('unread_count').notNull().default(0),
  isOpen: boolean('is_open').notNull().default(true),
  requireApproval: boolean('require_approval').notNull().default(false), // override per-chat
  aiEnabled: boolean('ai_enabled').notNull().default(false),
  funnelStage: varchar('funnel_stage', { length: 50 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  jidIdx: index('chats_jid_idx').on(t.remoteJid, t.instanceId),
}));

// ─── Messages ─────────────────────────────────────────────────────────────────
export const messages = pgTable('messages', {
  id: text('id').primaryKey(), // Evolution message id
  chatId: integer('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  fromMe: boolean('from_me').notNull().default(false),
  senderName: text('sender_name'),
  messageType: varchar('message_type', { length: 50 }).notNull().default('text'),
  text: text('text'),
  mediaUrl: text('media_url'),
  mediaMimetype: text('media_mimetype'),
  mediaCaption: text('media_caption'),
  quotedMessageId: text('quoted_message_id'),
  quotedText: text('quoted_text'),
  status: varchar('status', { length: 20 }).notNull().default('sent'), // 'sent'|'delivered'|'read'|'failed'
  isInternal: boolean('is_internal').notNull().default(false), // ملاحظات داخلية
  timestamp: timestamp('timestamp').notNull().defaultNow(),
}, (t) => ({
  chatIdx: index('messages_chat_idx').on(t.chatId, t.timestamp),
}));

// ─── Pending Messages (تحتاج موافقة) ─────────────────────────────────────────
export const pendingMessages = pgTable('pending_messages', {
  id: serial('id').primaryKey(),
  chatId: integer('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
  text: text('text').notNull(),
  source: varchar('source', { length: 20 }).notNull().default('agent'), // 'agent' | 'ai'
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending'|'approved'|'rejected'
  reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Quick Replies ────────────────────────────────────────────────────────────
export const quickReplies = pgTable('quick_replies', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
  shortcut: varchar('shortcut', { length: 50 }).notNull(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── AI Config ────────────────────────────────────────────────────────────────
export const aiConfig = pgTable('ai_config', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }).unique(),
  provider: varchar('provider', { length: 20 }).notNull().default('anthropic'), // 'anthropic'|'openai'|'gemini'
  model: varchar('model', { length: 100 }),
  systemPrompt: text('system_prompt'),
  temperature: integer('temperature').notNull().default(70), // 0-100
  maxTokens: integer('max_tokens').notNull().default(500),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Activity Logs ─────────────────────────────────────────────────────────────
export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').references(() => team.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  details: jsonb('details'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Invitations ──────────────────────────────────────────────────────────────
export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull().default('agent'),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Tags ─────────────────────────────────────────────────────────────────────
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 7 }).notNull().default('#6366f1'),
});

export const chatTags = pgTable('chat_tags', {
  chatId: integer('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: unique().on(t.chatId, t.tagId) }));

// ─── System Settings ──────────────────────────────────────────────────────────
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => team.id).unique(),
  evolutionApiUrl: text('evolution_api_url'),
  evolutionApiKey: text('evolution_api_key'),
  evolutionWebhookToken: text('evolution_webhook_token'),
  pusherAppId: text('pusher_app_id'),
  pusherKey: text('pusher_key'),
  pusherSecret: text('pusher_secret'),
  pusherCluster: text('pusher_cluster'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  assignedChats: many(chats),
}));

export const teamRelations = relations(team, ({ many, one }) => ({
  members: many(teamMembers),
  instances: many(instances),
  chats: many(chats),
  quickReplies: many(quickReplies),
  aiConfig: one(aiConfig),
  settings: one(settings),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
  team: one(team, { fields: [teamMembers.teamId], references: [team.id] }),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  team: one(team, { fields: [chats.teamId], references: [team.id] }),
  instance: one(instances, { fields: [chats.instanceId], references: [instances.id] }),
  assignedUser: one(users, { fields: [chats.assignedUserId], references: [users.id] }),
  messages: many(messages),
  pendingMessages: many(pendingMessages),
  tags: many(chatTags),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
}));

export const pendingMessagesRelations = relations(pendingMessages, ({ one }) => ({
  chat: one(chats, { fields: [pendingMessages.chatId], references: [chats.id] }),
  author: one(users, { fields: [pendingMessages.authorId], references: [users.id] }),
  reviewer: one(users, { fields: [pendingMessages.reviewedBy], references: [users.id] }),
}));

// ─── Automation (Flow Builder) ────────────────────────────────────────────────
export const automations = pgTable('automations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(false),
  triggerType: varchar('trigger_type', { length: 30 }).notNull().default('keyword'), // 'keyword'|'any_message'
  triggerKeywords: jsonb('trigger_keywords').$type<string[]>().default([]),
  nodes: jsonb('nodes').$type<any[]>().notNull().default([]),
  edges: jsonb('edges').$type<any[]>().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const automationsRelations = relations(automations, ({ one }) => ({
  team: one(team, { fields: [automations.teamId], references: [team.id] }),
}));

export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;

// ─── Campaigns ─────────────────────────────────────────────────────────────────
export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
  instanceId: integer('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  messageText: text('message_text').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('DRAFT'), // DRAFT|SCHEDULED|PROCESSING|COMPLETED
  scheduledAt: timestamp('scheduled_at'),
  totalLeads: integer('total_leads').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const campaignLeads = pgTable('campaign_leads', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  phone: varchar('phone', { length: 50 }).notNull(),
  variables: jsonb('variables').$type<Record<string, string>>().default({}),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING|SENDING|SENT|FAILED
  error: text('error'),
});

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  team: one(team, { fields: [campaigns.teamId], references: [team.id] }),
  instance: one(instances, { fields: [campaigns.instanceId], references: [instances.id] }),
  leads: many(campaignLeads),
}));

export const campaignLeadsRelations = relations(campaignLeads, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignLeads.campaignId], references: [campaigns.id] }),
}));

export type Campaign = typeof campaigns.$inferSelect;
export type CampaignLead = typeof campaignLeads.$inferSelect;

// ─── Contacts (CRM) ────────────────────────────────────────────────────────────
export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
  chatId: integer('chat_id').references(() => chats.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 100 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const contactsRelations = relations(contacts, ({ one }) => ({
  team: one(team, { fields: [contacts.teamId], references: [team.id] }),
  chat: one(chats, { fields: [contacts.chatId], references: [chats.id] }),
}));

export type Contact = typeof contacts.$inferSelect;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof team.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type Instance = typeof instances.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type PendingMessage = typeof pendingMessages.$inferSelect;
export type QuickReply = typeof quickReplies.$inferSelect;
export type AiConfig = typeof aiConfig.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
