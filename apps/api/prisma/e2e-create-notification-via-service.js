'use strict';
/**
 * E2E seam — creates a notification respecting in-app preference opt-outs.
 * Mirrors NotificationsService.create() + NotificationPreferencesService.isInAppAllowed()
 * without bootstrapping the full NestJS app.
 *
 * Usage: node e2e-create-notification-via-service.js <recipientId> <type>
 * Writes JSON line to stdout: { created: boolean, id: string|null }
 */

// Load .env walking up from __dirname so DATABASE_URL is available locally.
// No-op when vars are already set (CI injects them; existing vars are preserved).
const { existsSync, readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');

(function loadLocalEnv() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      for (const line of readFileSync(candidate, 'utf8').split('\n')) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].trim();
        // Strip surrounding quotes (single or double)
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!process.env[m[1]]) process.env[m[1]] = v; // preserve existing vars (CI override)
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
})();

const { PrismaClient } = require('@prisma/client');

// Mirrors NOTIF_TYPE_TO_PREF from @encre-et-plume/shared (suppressible types only).
// Mandatory types (report → moderation, system → account) are not listed here — they always create.
const NOTIF_TYPE_TO_PREF = {
  message: 'messages',
  application: 'applications',
  like: 'reactions',
};

async function main() {
  const [recipientId, type] = process.argv.slice(2);
  if (!recipientId || !type) {
    throw new Error('Usage: e2e-create-notification-via-service.js <recipientId> <type>');
  }

  const prisma = new PrismaClient();
  try {
    // isInAppAllowed — mirrors preferences.service.ts logic
    const prefType = NOTIF_TYPE_TO_PREF[type];
    let allowed = true;
    if (prefType) {
      // Non-mandatory: check stored pref; default is enabled (defaultInApp = true for all current types)
      const row = await prisma.notificationPreference.findUnique({
        where: { accountId_type_channel: { accountId: recipientId, type: prefType, channel: 'in_app' } },
      });
      allowed = row ? row.enabled : true;
    }
    // Mandatory / unmapped types: always allowed

    if (!allowed) {
      process.stdout.write(JSON.stringify({ created: false, id: null }) + '\n');
      return;
    }

    const notification = await prisma.notification.create({
      data: { recipientId, type },
    });
    process.stdout.write(JSON.stringify({ created: true, id: notification.id }) + '\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
