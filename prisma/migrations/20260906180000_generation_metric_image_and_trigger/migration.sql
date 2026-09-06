-- AlterTable
ALTER TABLE "GenerationMetric" ADD COLUMN     "imageFailureReason" TEXT,
ADD COLUMN     "imageLatencyMs" INTEGER,
ADD COLUMN     "imageOutcome" TEXT,
ADD COLUMN     "imageStatus" TEXT,
ADD COLUMN     "sourceExtractionSuccess" BOOLEAN,
ADD COLUMN     "triggerType" TEXT NOT NULL DEFAULT 'batch_cron';

-- CreateIndex
CREATE INDEX "GenerationMetric_triggerType_idx" ON "GenerationMetric"("triggerType");
