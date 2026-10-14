-- CreateTable
CREATE TABLE "LowStockAlertReview" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LowStockAlertReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LowStockAlertReview_shop_reviewedAt_idx" ON "LowStockAlertReview"("shop", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LowStockAlertReview_shop_productId_key" ON "LowStockAlertReview"("shop", "productId");
