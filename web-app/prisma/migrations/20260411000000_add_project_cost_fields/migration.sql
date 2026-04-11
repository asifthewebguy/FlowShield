-- AlterTable
ALTER TABLE "projects" ADD COLUMN "hourly_rate" DECIMAL(10,2),
ADD COLUMN "budget" DECIMAL(10,2),
ADD COLUMN "planned_hours" DOUBLE PRECISION;
