-- CreateTable
CREATE TABLE "PipelineSchedule" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "ingestionIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "verifyIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastIngestionRunAt" TIMESTAMP(3),
    "lastVerifyRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineSchedule_pkey" PRIMARY KEY ("id")
);
