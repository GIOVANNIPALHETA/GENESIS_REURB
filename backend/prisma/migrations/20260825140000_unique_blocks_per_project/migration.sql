CREATE UNIQUE INDEX "Block_projectId_number_key" ON "Block"("projectId", "number");
ALTER TABLE "Block" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;