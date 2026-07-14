-- CreateTable
CREATE TABLE "ScenarioDocument" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "ydocState" BYTEA NOT NULL,
    "contentJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioUpdate" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "update" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioComment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "caseNo" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioDocument_assetId_key" ON "ScenarioDocument"("assetId");

-- CreateIndex
CREATE INDEX "ScenarioUpdate_documentId_createdAt_idx" ON "ScenarioUpdate"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "ScenarioComment_documentId_caseNo_createdAt_idx" ON "ScenarioComment"("documentId", "caseNo", "createdAt");

-- AddForeignKey
ALTER TABLE "ScenarioDocument" ADD CONSTRAINT "ScenarioDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioUpdate" ADD CONSTRAINT "ScenarioUpdate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ScenarioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioComment" ADD CONSTRAINT "ScenarioComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ScenarioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioComment" ADD CONSTRAINT "ScenarioComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
