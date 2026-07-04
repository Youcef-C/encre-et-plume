-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reaction_targetType_targetId_kind_idx" ON "Reaction"("targetType", "targetId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_accountId_targetType_targetId_kind_key" ON "Reaction"("accountId", "targetType", "targetId", "kind");

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

