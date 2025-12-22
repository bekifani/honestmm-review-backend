-- AlterTable
ALTER TABLE "public"."File" ADD COLUMN     "workspaceId" INTEGER;

-- CreateTable
CREATE TABLE "public"."Workspace" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Workspace" ADD CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
