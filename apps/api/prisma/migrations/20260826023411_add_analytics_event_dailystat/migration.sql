-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "visitorId" UUID,
    "accountId" UUID,
    "targetType" TEXT,
    "targetId" UUID,
    "path" TEXT,
    "ref" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "day" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "dim" TEXT NOT NULL DEFAULT '',
    "value" INTEGER NOT NULL,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("day","metric","dim")
);

-- CreateIndex
CREATE INDEX "Event_at_idx" ON "Event"("at");

-- CreateIndex
CREATE INDEX "Event_kind_at_idx" ON "Event"("kind", "at");

-- CreateIndex
CREATE INDEX "Event_targetType_targetId_at_idx" ON "Event"("targetType", "targetId", "at");

-- CreateIndex
CREATE INDEX "Event_accountId_idx" ON "Event"("accountId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
