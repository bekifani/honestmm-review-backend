-- AlterTable
ALTER TABLE "public"."File" ADD COLUMN     "extractedText" TEXT;

-- CreateTable
CREATE TABLE "public"."ExtractedFact" (
    "id" SERIAL NOT NULL,
    "fileId" INTEGER NOT NULL,
    "facts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedFact_fileId_key" ON "public"."ExtractedFact"("fileId");

-- AddForeignKey
ALTER TABLE "public"."ExtractedFact" ADD CONSTRAINT "ExtractedFact_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
