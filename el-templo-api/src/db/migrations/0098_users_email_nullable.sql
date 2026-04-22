-- Phase 102 R3: Make users.email nullable so trial users (leads) can be
-- created with email=NULL. SPEC R3 requires this for the POST
-- /api/admin/scheduling/trials endpoint, where staff register a prospect
-- with only firstName/lastName/phone.
--
-- Safe operation: MODIFY only widens the column (drops NOT NULL). The
-- UNIQUE index is preserved — InnoDB treats NULLs as distinct under
-- UNIQUE, so multiple rows with email=NULL coexist without conflict.

ALTER TABLE `users`
  MODIFY `email` VARCHAR(255) NULL;
