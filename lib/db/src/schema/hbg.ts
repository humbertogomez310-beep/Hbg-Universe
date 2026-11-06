import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const hbgUsers = pgTable("hbg_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  role: text("role").notNull(),
  credentialHash: text("credential_hash"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hbgSessions = pgTable("hbg_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => hbgUsers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hbgDevelopmentSessions = pgTable("hbg_development_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => hbgUsers.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const hbgAuditEvents = pgTable("hbg_audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => hbgUsers.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  result: text("result").notNull(),
  errorCode: text("error_code"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hbgTerminadorAuthorizations = pgTable(
  "hbg_terminador_authorizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => hbgUsers.id, { onDelete: "cascade" }),
    sessionTokenHash: text("session_token_hash").notNull(),
    developmentSessionTokenHash: text("development_session_token_hash").notNull(),
    operation: text("operation").notNull(),
    resource: text("resource").notNull(),
    applicationId: text("application_id").notNull(),
    workspace: text("workspace").notNull(),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull(),
    requestedPermissions: jsonb("requested_permissions")
      .$type<string[]>()
      .notNull(),
    contentHash: text("content_hash"),
    proposalHash: text("proposal_hash").notNull(),
    reason: text("reason").notNull(),
    state: text("state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => hbgUsers.id, {
      onDelete: "set null",
    }),
    approvalSessionTokenHash: text("approval_session_token_hash"),
    deniedAt: timestamp("denied_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
);

export const hbgApplications = pgTable("hbg_applications", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  status: text("status").notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HBGUser = typeof hbgUsers.$inferSelect;
export type HBGSession = typeof hbgSessions.$inferSelect;
export type HBGDevelopmentSession = typeof hbgDevelopmentSessions.$inferSelect;
export type HBGApplication = typeof hbgApplications.$inferSelect;