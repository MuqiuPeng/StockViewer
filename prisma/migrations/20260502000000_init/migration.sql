-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('FULL_REFRESH', 'CUSTOM_DATA', 'DELETE_DATASET');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "statusReviewedBy" TEXT,
    "statusReviewedAt" TIMESTAMP(3),
    "statusReviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "category" TEXT,
    "exchange" TEXT,
    "firstDate" TIMESTAMP(3),
    "lastDate" TIMESTAMP(3),
    "lastUpdate" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPrice" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DECIMAL(18,4) NOT NULL,
    "high" DECIMAL(18,4) NOT NULL,
    "low" DECIMAL(18,4) NOT NULL,
    "close" DECIMAL(18,4) NOT NULL,
    "volume" BIGINT NOT NULL DEFAULT 0,
    "turnover" DECIMAL(24,2),
    "amplitude" DECIMAL(12,4),
    "changePct" DECIMAL(12,4),
    "changeAmount" DECIMAL(18,4),
    "turnoverRate" DECIMAL(12,4),

    CONSTRAINT "StockPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Indicator" (
    "id" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pythonCode" TEXT NOT NULL,
    "outputColumn" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "codeHash" TEXT NOT NULL DEFAULT '',
    "dependencies" TEXT[],
    "dependencyColumns" TEXT[],
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "groupName" TEXT,
    "expectedOutputs" TEXT[],
    "externalDatasets" JSONB,
    "category" TEXT,
    "tags" TEXT[],
    "period" TEXT NOT NULL DEFAULT 'daily',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Indicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIndicator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "displayName" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicatorValue" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "stockPriceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "value" DECIMAL(18,6),
    "groupValues" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndicatorValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIndicator" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pythonCode" TEXT NOT NULL,
    "strategyType" TEXT NOT NULL DEFAULT 'single',
    "constraints" JSONB,
    "parameters" JSONB,
    "externalDatasets" JSONB,
    "dependencies" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStrategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "displayName" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestHistoryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "strategyName" TEXT NOT NULL,
    "strategyType" TEXT NOT NULL,
    "target" JSONB NOT NULL,
    "parameters" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "tags" TEXT[],
    "totalReturn" DOUBLE PRECISION NOT NULL,
    "totalReturnPct" DOUBLE PRECISION NOT NULL,
    "sharpeRatio" DOUBLE PRECISION NOT NULL,
    "tradeCount" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockGroup" (
    "id" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stockIds" TEXT[],
    "isDataSource" BOOLEAN NOT NULL DEFAULT false,
    "dataSourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStockGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "displayName" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStockGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewSetting" (
    "id" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabledIndicators1" TEXT[],
    "enabledIndicators2" TEXT[],
    "constantLines1" JSONB NOT NULL,
    "constantLines2" JSONB NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'daily',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserViewSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewSettingId" TEXT NOT NULL,
    "displayName" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserViewSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImportJob" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsvDataBlob" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "columnMapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsvDataBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostAttachment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "originalId" TEXT,
    "originalName" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "dependencies" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharePost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "stockId" TEXT,
    "indicatorId" TEXT,
    "strategyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroupInvitation" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGroupInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroupMessage" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT,
    "indicatorId" TEXT,
    "strategyId" TEXT,
    "stockGroupId" TEXT,
    "viewSettingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGroupMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Stock_symbol_idx" ON "Stock"("symbol");

-- CreateIndex
CREATE INDEX "Stock_dataSource_idx" ON "Stock"("dataSource");

-- CreateIndex
CREATE INDEX "Stock_category_idx" ON "Stock"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_symbol_dataSource_key" ON "Stock"("symbol", "dataSource");

-- CreateIndex
CREATE INDEX "StockPrice_stockId_date_idx" ON "StockPrice"("stockId", "date");

-- CreateIndex
CREATE INDEX "StockPrice_date_idx" ON "StockPrice"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StockPrice_stockId_date_key" ON "StockPrice"("stockId", "date");

-- CreateIndex
CREATE INDEX "UserStock_userId_idx" ON "UserStock"("userId");

-- CreateIndex
CREATE INDEX "UserStock_stockId_idx" ON "UserStock"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStock_userId_stockId_key" ON "UserStock"("userId", "stockId");

-- CreateIndex
CREATE INDEX "Indicator_createdBy_idx" ON "Indicator"("createdBy");

-- CreateIndex
CREATE INDEX "Indicator_name_idx" ON "Indicator"("name");

-- CreateIndex
CREATE INDEX "Indicator_category_idx" ON "Indicator"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Indicator_name_createdBy_key" ON "Indicator"("name", "createdBy");

-- CreateIndex
CREATE INDEX "UserIndicator_userId_idx" ON "UserIndicator"("userId");

-- CreateIndex
CREATE INDEX "UserIndicator_indicatorId_idx" ON "UserIndicator"("indicatorId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIndicator_userId_indicatorId_key" ON "UserIndicator"("userId", "indicatorId");

-- CreateIndex
CREATE INDEX "IndicatorValue_indicatorId_version_idx" ON "IndicatorValue"("indicatorId", "version");

-- CreateIndex
CREATE INDEX "IndicatorValue_stockPriceId_idx" ON "IndicatorValue"("stockPriceId");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorValue_indicatorId_stockPriceId_version_key" ON "IndicatorValue"("indicatorId", "stockPriceId", "version");

-- CreateIndex
CREATE INDEX "StockIndicator_stockId_idx" ON "StockIndicator"("stockId");

-- CreateIndex
CREATE INDEX "StockIndicator_indicatorId_idx" ON "StockIndicator"("indicatorId");

-- CreateIndex
CREATE UNIQUE INDEX "StockIndicator_stockId_indicatorId_key" ON "StockIndicator"("stockId", "indicatorId");

-- CreateIndex
CREATE INDEX "Strategy_createdBy_idx" ON "Strategy"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_name_key" ON "Strategy"("name");

-- CreateIndex
CREATE INDEX "UserStrategy_userId_idx" ON "UserStrategy"("userId");

-- CreateIndex
CREATE INDEX "UserStrategy_strategyId_idx" ON "UserStrategy"("strategyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStrategy_userId_strategyId_key" ON "UserStrategy"("userId", "strategyId");

-- CreateIndex
CREATE INDEX "BacktestHistoryEntry_userId_idx" ON "BacktestHistoryEntry"("userId");

-- CreateIndex
CREATE INDEX "BacktestHistoryEntry_userId_createdAt_idx" ON "BacktestHistoryEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BacktestHistoryEntry_userId_starred_idx" ON "BacktestHistoryEntry"("userId", "starred");

-- CreateIndex
CREATE INDEX "BacktestHistoryEntry_strategyId_idx" ON "BacktestHistoryEntry"("strategyId");

-- CreateIndex
CREATE INDEX "StockGroup_createdBy_idx" ON "StockGroup"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "StockGroup_name_key" ON "StockGroup"("name");

-- CreateIndex
CREATE INDEX "UserStockGroup_userId_idx" ON "UserStockGroup"("userId");

-- CreateIndex
CREATE INDEX "UserStockGroup_groupId_idx" ON "UserStockGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStockGroup_userId_groupId_key" ON "UserStockGroup"("userId", "groupId");

-- CreateIndex
CREATE INDEX "ViewSetting_createdBy_idx" ON "ViewSetting"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "ViewSetting_name_key" ON "ViewSetting"("name");

-- CreateIndex
CREATE INDEX "UserViewSetting_userId_idx" ON "UserViewSetting"("userId");

-- CreateIndex
CREATE INDEX "UserViewSetting_viewSettingId_idx" ON "UserViewSetting"("viewSettingId");

-- CreateIndex
CREATE UNIQUE INDEX "UserViewSetting_userId_viewSettingId_key" ON "UserViewSetting"("userId", "viewSettingId");

-- CreateIndex
CREATE INDEX "DataImportJob_status_idx" ON "DataImportJob"("status");

-- CreateIndex
CREATE INDEX "DataImportJob_symbol_dataSource_idx" ON "DataImportJob"("symbol", "dataSource");

-- CreateIndex
CREATE INDEX "Ticket_userId_idx" ON "Ticket"("userId");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_type_status_idx" ON "Ticket"("type", "status");

-- CreateIndex
CREATE INDEX "Ticket_createdAt_idx" ON "Ticket"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CsvDataBlob_ticketId_key" ON "CsvDataBlob"("ticketId");

-- CreateIndex
CREATE INDEX "Post_userId_idx" ON "Post"("userId");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateIndex
CREATE INDEX "PostImage_postId_idx" ON "PostImage"("postId");

-- CreateIndex
CREATE INDEX "PostAttachment_postId_idx" ON "PostAttachment"("postId");

-- CreateIndex
CREATE INDEX "PostAttachment_type_idx" ON "PostAttachment"("type");

-- CreateIndex
CREATE INDEX "SharePost_userId_idx" ON "SharePost"("userId");

-- CreateIndex
CREATE INDEX "SharePost_createdAt_idx" ON "SharePost"("createdAt");

-- CreateIndex
CREATE INDEX "UserGroup_ownerId_idx" ON "UserGroup"("ownerId");

-- CreateIndex
CREATE INDEX "UserGroupMember_groupId_idx" ON "UserGroupMember"("groupId");

-- CreateIndex
CREATE INDEX "UserGroupMember_userId_idx" ON "UserGroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroupMember_groupId_userId_key" ON "UserGroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "UserGroupInvitation_groupId_idx" ON "UserGroupInvitation"("groupId");

-- CreateIndex
CREATE INDEX "UserGroupInvitation_userId_idx" ON "UserGroupInvitation"("userId");

-- CreateIndex
CREATE INDEX "UserGroupInvitation_status_idx" ON "UserGroupInvitation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroupInvitation_groupId_userId_key" ON "UserGroupInvitation"("groupId", "userId");

-- CreateIndex
CREATE INDEX "UserGroupMessage_groupId_idx" ON "UserGroupMessage"("groupId");

-- CreateIndex
CREATE INDEX "UserGroupMessage_userId_idx" ON "UserGroupMessage"("userId");

-- CreateIndex
CREATE INDEX "UserGroupMessage_groupId_createdAt_idx" ON "UserGroupMessage"("groupId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_statusReviewedBy_fkey" FOREIGN KEY ("statusReviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPrice" ADD CONSTRAINT "StockPrice_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStock" ADD CONSTRAINT "UserStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStock" ADD CONSTRAINT "UserStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Indicator" ADD CONSTRAINT "Indicator_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIndicator" ADD CONSTRAINT "UserIndicator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIndicator" ADD CONSTRAINT "UserIndicator_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorValue" ADD CONSTRAINT "IndicatorValue_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorValue" ADD CONSTRAINT "IndicatorValue_stockPriceId_fkey" FOREIGN KEY ("stockPriceId") REFERENCES "StockPrice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIndicator" ADD CONSTRAINT "StockIndicator_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIndicator" ADD CONSTRAINT "StockIndicator_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStrategy" ADD CONSTRAINT "UserStrategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStrategy" ADD CONSTRAINT "UserStrategy_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestHistoryEntry" ADD CONSTRAINT "BacktestHistoryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestHistoryEntry" ADD CONSTRAINT "BacktestHistoryEntry_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockGroup" ADD CONSTRAINT "StockGroup_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStockGroup" ADD CONSTRAINT "UserStockGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStockGroup" ADD CONSTRAINT "UserStockGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StockGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewSetting" ADD CONSTRAINT "ViewSetting_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserViewSetting" ADD CONSTRAINT "UserViewSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserViewSetting" ADD CONSTRAINT "UserViewSetting_viewSettingId_fkey" FOREIGN KEY ("viewSettingId") REFERENCES "ViewSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsvDataBlob" ADD CONSTRAINT "CsvDataBlob_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostImage" ADD CONSTRAINT "PostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAttachment" ADD CONSTRAINT "PostAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupInvitation" ADD CONSTRAINT "UserGroupInvitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupInvitation" ADD CONSTRAINT "UserGroupInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMessage" ADD CONSTRAINT "UserGroupMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMessage" ADD CONSTRAINT "UserGroupMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMessage" ADD CONSTRAINT "UserGroupMessage_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMessage" ADD CONSTRAINT "UserGroupMessage_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMessage" ADD CONSTRAINT "UserGroupMessage_stockGroupId_fkey" FOREIGN KEY ("stockGroupId") REFERENCES "StockGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMessage" ADD CONSTRAINT "UserGroupMessage_viewSettingId_fkey" FOREIGN KEY ("viewSettingId") REFERENCES "ViewSetting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

