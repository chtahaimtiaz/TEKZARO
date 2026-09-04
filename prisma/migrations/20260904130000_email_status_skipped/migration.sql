-- Adds a status for sends that were deliberately not attempted, so they stop
-- being recorded as delivery failures.
--
-- Two things were driving real SMTP traffic that could never succeed: the
-- test suite runs against this database and fires notification emails at
-- RFC 2606 reserved addresses (@example.com), and those rejections
-- (554 5.7.1) accumulate against the sending mailbox's reputation. In a
-- single 24h window this produced 507 failures against 307 successes, and
-- genuine notifications to real editors began being rejected too.

-- AlterEnum
ALTER TYPE "EmailStatus" ADD VALUE 'SKIPPED';
