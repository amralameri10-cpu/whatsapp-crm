import postgres from 'postgres';

async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const sql = postgres(url, { prepare: false });

  console.log('⏳ Creating tables...');

  await sql`
    CREATE TABLE IF NOT EXISTS "team" (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL DEFAULT 'My Company',
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" serial PRIMARY KEY,
      "email" varchar(255) NOT NULL UNIQUE,
      "name" varchar(100),
      "password_hash" text NOT NULL,
      "role" varchar(20) NOT NULL DEFAULT 'member',
      "avatar_url" text,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "team_members" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "team_id" integer NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      "role" varchar(20) NOT NULL DEFAULT 'agent',
      "can_see_phone" boolean NOT NULL DEFAULT false,
      "require_approval" boolean NOT NULL DEFAULT false,
      "can_use_ai" boolean NOT NULL DEFAULT false,
      "can_view_all_chats" boolean NOT NULL DEFAULT false,
      "created_at" timestamp NOT NULL DEFAULT now(),
      UNIQUE (user_id, team_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "settings" (
      "id" serial PRIMARY KEY,
      "team_id" integer NOT NULL REFERENCES team(id) UNIQUE,
      "evolution_api_url" text,
      "evolution_api_key" text,
      "evolution_webhook_token" text,
      "pusher_app_id" text,
      "pusher_key" text,
      "pusher_secret" text,
      "pusher_cluster" text,
      "updated_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "instances" (
      "id" serial PRIMARY KEY,
      "team_id" integer NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      "instance_name" text NOT NULL UNIQUE,
      "display_name" text,
      "access_token" text,
      "phone_number" varchar(30),
      "profile_pic_url" text,
      "status" varchar(20) NOT NULL DEFAULT 'disconnected',
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "chats" (
      "id" serial PRIMARY KEY,
      "team_id" integer NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      "instance_id" integer NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
      "remote_jid" text NOT NULL,
      "name" text,
      "phone_number" text,
      "is_group" boolean NOT NULL DEFAULT false,
      "assigned_user_id" integer REFERENCES users(id) ON DELETE SET NULL,
      "last_message_text" text,
      "last_message_at" timestamp,
      "last_message_from_me" boolean DEFAULT false,
      "unread_count" integer NOT NULL DEFAULT 0,
      "is_open" boolean NOT NULL DEFAULT true,
      "require_approval" boolean NOT NULL DEFAULT false,
      "ai_enabled" boolean NOT NULL DEFAULT false,
      "funnel_stage" varchar(50),
      "notes" text,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "chats_jid_idx" ON "chats" ("remote_jid", "instance_id");
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "messages" (
      "id" text PRIMARY KEY,
      "chat_id" integer NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      "from_me" boolean NOT NULL DEFAULT false,
      "sender_name" text,
      "message_type" varchar(50) NOT NULL DEFAULT 'text',
      "text" text,
      "media_url" text,
      "media_mimetype" text,
      "media_caption" text,
      "quoted_message_id" text,
      "quoted_text" text,
      "status" varchar(20) NOT NULL DEFAULT 'sent',
      "is_internal" boolean NOT NULL DEFAULT false,
      "timestamp" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "messages_chat_idx" ON "messages" ("chat_id", "timestamp");
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "pending_messages" (
      "id" serial PRIMARY KEY,
      "chat_id" integer NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      "author_id" integer REFERENCES users(id) ON DELETE SET NULL,
      "text" text NOT NULL,
      "source" varchar(20) NOT NULL DEFAULT 'agent',
      "status" varchar(20) NOT NULL DEFAULT 'pending',
      "reviewed_by" integer REFERENCES users(id) ON DELETE SET NULL,
      "reviewed_at" timestamp,
      "rejection_reason" text,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "quick_replies" (
      "id" serial PRIMARY KEY,
      "team_id" integer NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      "shortcut" varchar(50) NOT NULL,
      "text" text NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "ai_config" (
      "id" serial PRIMARY KEY,
      "team_id" integer NOT NULL REFERENCES team(id) UNIQUE,
      "provider" varchar(20) NOT NULL DEFAULT 'anthropic',
      "model" varchar(100),
      "system_prompt" text,
      "temperature" integer NOT NULL DEFAULT 70,
      "max_tokens" integer NOT NULL DEFAULT 500,
      "updated_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "automations" (
      "id" serial PRIMARY KEY,
      "team_id" integer NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      "name" varchar(255) NOT NULL,
      "is_active" boolean NOT NULL DEFAULT false,
      "trigger_type" varchar(30) NOT NULL DEFAULT 'keyword',
      "trigger_keywords" jsonb DEFAULT '[]',
      "nodes" jsonb NOT NULL DEFAULT '[]',
      "edges" jsonb NOT NULL DEFAULT '[]',
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "campaigns" (
      "id" serial PRIMARY KEY,
      "team_id" integer NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      "instance_id" integer NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
      "name" varchar(255) NOT NULL,
      "message_text" text NOT NULL,
      "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
      "scheduled_at" timestamp,
      "total_leads" integer NOT NULL DEFAULT 0,
      "sent_count" integer NOT NULL DEFAULT 0,
      "failed_count" integer NOT NULL DEFAULT 0,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "campaign_leads" (
      "id" serial PRIMARY KEY,
      "campaign_id" integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      "phone" varchar(50) NOT NULL,
      "variables" jsonb DEFAULT '{}',
      "status" varchar(20) NOT NULL DEFAULT 'PENDING',
      "error" text
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "contacts" (
      "id" serial PRIMARY KEY,
      "team_id" integer NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      "chat_id" integer REFERENCES chats(id) ON DELETE SET NULL,
      "name" varchar(100),
      "phone" varchar(50),
      "email" varchar(255),
      "notes" text,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "tags" (
      "id" serial PRIMARY KEY,
      "team_id" integer NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      "name" varchar(50) NOT NULL,
      "color" varchar(7) NOT NULL DEFAULT '#6366f1'
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "chat_tags" (
      "chat_id" integer NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      "tag_id" integer NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE (chat_id, tag_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "invitations" (
      "id" serial PRIMARY KEY,
      "team_id" integer NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      "email" varchar(255) NOT NULL,
      "role" varchar(20) NOT NULL DEFAULT 'agent',
      "token" text NOT NULL UNIQUE,
      "expires_at" timestamp NOT NULL,
      "used_at" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "activity_logs" (
      "id" serial PRIMARY KEY,
      "team_id" integer REFERENCES team(id) ON DELETE CASCADE,
      "user_id" integer REFERENCES users(id) ON DELETE SET NULL,
      "action" varchar(100) NOT NULL,
      "details" jsonb,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `;

  console.log('✅ Database setup complete!');
  await sql.end();
}

setup().catch((e) => { console.error(e); process.exit(1); });
