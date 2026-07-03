-- F-18: Account security — TwoFactorCredential + EmailChangeToken

-- CreateTable TwoFactorCredential: one TOTP credential per account (optional; enabledAt null = pending)
CREATE TABLE "TwoFactorCredential" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "backupCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable EmailChangeToken: pending email-change requests (mirrors F-11 EmailVerificationToken)
CREATE TABLE "EmailChangeToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorCredential_accountId_key" ON "TwoFactorCredential"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailChangeToken_tokenHash_key" ON "EmailChangeToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailChangeToken_accountId_idx" ON "EmailChangeToken"("accountId");

-- AddForeignKey
ALTER TABLE "TwoFactorCredential" ADD CONSTRAINT "TwoFactorCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailChangeToken" ADD CONSTRAINT "EmailChangeToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
