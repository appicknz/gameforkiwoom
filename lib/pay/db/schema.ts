import {
  pgTable, text, timestamp, boolean, integer
} from "drizzle-orm/pg-core"

// Better Auth 테이블 (pay_ prefix)
export const payUser = pgTable("pay_user", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull(),
  email:         text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image:         text("image"),
  createdAt:     timestamp("createdAt").notNull().defaultNow(),
  updatedAt:     timestamp("updatedAt").notNull().defaultNow(),
})

export const paySession = pgTable("pay_session", {
  id:          text("id").primaryKey(),
  expiresAt:   timestamp("expiresAt").notNull(),
  token:       text("token").notNull().unique(),
  createdAt:   timestamp("createdAt").notNull().defaultNow(),
  updatedAt:   timestamp("updatedAt").notNull().defaultNow(),
  ipAddress:   text("ipAddress"),
  userAgent:   text("userAgent"),
  userId:      text("userId").notNull().references(() => payUser.id, { onDelete: "cascade" }),
})

export const payAccount = pgTable("pay_account", {
  id:                      text("id").primaryKey(),
  accountId:               text("accountId").notNull(),
  providerId:              text("providerId").notNull(),
  userId:                  text("userId").notNull().references(() => payUser.id, { onDelete: "cascade" }),
  accessToken:             text("accessToken"),
  refreshToken:            text("refreshToken"),
  idToken:                 text("idToken"),
  accessTokenExpiresAt:    timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt:   timestamp("refreshTokenExpiresAt"),
  scope:                   text("scope"),
  password:                text("password"),
  createdAt:               timestamp("createdAt").notNull().defaultNow(),
  updatedAt:               timestamp("updatedAt").notNull().defaultNow(),
})

export const payVerification = pgTable("pay_verification", {
  id:         text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value:      text("value").notNull(),
  expiresAt:  timestamp("expiresAt").notNull(),
  createdAt:  timestamp("createdAt").defaultNow(),
  updatedAt:  timestamp("updatedAt").defaultNow(),
})

// 앱 테이블
export const payManagers = pgTable("pay_managers", {
  id:                text("id").primaryKey(),             // Better Auth user id
  uniqueCode:        text("unique_code").notNull().unique(),
  telegramBotToken:  text("telegram_bot_token"),
  telegramChatId:    text("telegram_chat_id"),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
})

export const payMembers = pgTable("pay_members", {
  id:            text("id").primaryKey(),
  telegramId:    text("telegram_id").unique(),
  firstName:     text("first_name").notNull(),
  lastName:      text("last_name"),
  username:      text("username"),
  managerId:     text("manager_id"),
  botChatId:     text("bot_chat_id"),     // 봇과 대화한 실제 chat_id
  botStartedAt:  timestamp("bot_started_at"), // 봇 /start 한 시각
  createdAt:     timestamp("created_at").notNull().defaultNow(),
})

export const payRequests = pgTable("pay_requests", {
  id:                   text("id").primaryKey(),
  memberId:             text("member_id"),
  managerId:            text("manager_id"),
  telegramId:           text("telegram_id"),
  telegramUsername:     text("telegram_username"),
  siteId:               text("site_id").notNull(),
  referralCode:         text("referral_code").default(""),
  walletAddress:        text("wallet_address"),
  chain:                text("chain").default("TRX"),
  telegramInput:        text("telegram_input"),
  amount:               integer("amount").notNull(),
  status:               text("status").notNull().default("pending"),
  managerConfirmedAt:   timestamp("manager_confirmed_at"),
  masterConfirmedAt:    timestamp("master_confirmed_at"),
  completedAt:          timestamp("completed_at"),
  webhookData:          text("webhook_data"),
  settlementStatus:     text("settlement_status").notNull().default("pending"),
  settlementDate:       timestamp("settlement_date"),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
})

export const payMasterSettings = pgTable("pay_master_settings", {
  id:                text("id").primaryKey().default("1"),
  telegramBotToken:  text("telegram_bot_token"),
  telegramChatId:    text("telegram_chat_id"),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
})
