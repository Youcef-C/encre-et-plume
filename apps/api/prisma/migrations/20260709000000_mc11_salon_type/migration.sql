-- MC-11: add the 'salon' conversation type. Postgres forbids adding AND using an enum value in one
-- transaction, so this migration only adds the value; the singleton salon row is created lazily at runtime.
ALTER TYPE "ConversationType" ADD VALUE 'salon';
