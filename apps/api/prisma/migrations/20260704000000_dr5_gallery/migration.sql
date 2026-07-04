-- CreateTable
CREATE TABLE "Illustration" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistId" TEXT,
    "artistName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "image" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "weeklyLikeDelta" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Illustration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Illustration_publishedAt_idx" ON "Illustration"("publishedAt");

-- CreateIndex
CREATE INDEX "Illustration_weeklyLikeDelta_idx" ON "Illustration"("weeklyLikeDelta");

-- CreateIndex
CREATE INDEX "Illustration_likeCount_idx" ON "Illustration"("likeCount");

-- CreateIndex
CREATE INDEX "Illustration_category_idx" ON "Illustration"("category");

-- AddForeignKey
ALTER TABLE "Illustration" ADD CONSTRAINT "Illustration_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

