-- AlterTable
ALTER TABLE "Work" ADD COLUMN     "audienceRating" TEXT NOT NULL DEFAULT 'Tous publics',
ADD COLUMN     "chapterCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "complete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'Manga',
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'Français',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "themes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "ctaLabel" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorPick" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contest_active_idx" ON "Contest"("active");

-- CreateIndex
CREATE INDEX "EditorPick_order_idx" ON "EditorPick"("order");

-- CreateIndex
CREATE INDEX "Work_publishedAt_idx" ON "Work"("publishedAt");

-- CreateIndex
CREATE INDEX "Work_ratingAvg_idx" ON "Work"("ratingAvg");

-- AddForeignKey
ALTER TABLE "EditorPick" ADD CONSTRAINT "EditorPick_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

