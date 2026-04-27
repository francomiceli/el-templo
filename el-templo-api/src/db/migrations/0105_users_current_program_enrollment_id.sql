-- Phase 104 R5: users.current_program_enrollment_id pointer.
-- INT NULL pointer to program_enrollments(id) — the member's currently
-- selected program (one of their active enrollments) or NULL meaning
-- "Templo view" (only valid if the member has an active presencial plan).
-- ON DELETE SET NULL: if the enrollment row is hard-deleted, the
-- pointer clears automatically rather than dangling. Status changes
-- (active to cancelled/expired) do not trigger this — service layer
-- (Plan 02 expire path, Plan 04 PUT validation) handles status hygiene.

ALTER TABLE `users`
  ADD COLUMN `current_program_enrollment_id` INT NULL,
  ADD CONSTRAINT `fk_users_current_program_enrollment`
    FOREIGN KEY (`current_program_enrollment_id`)
    REFERENCES `program_enrollments`(`id`)
    ON DELETE SET NULL;
