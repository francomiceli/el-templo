-- Update client_state enum to match CONTEXT.md locked decisions:
-- Old values: lead, trial, active_member, lapsed, returning
-- New values: lead, trial, active_member, inactive_member, expired_member
ALTER TABLE whatsapp_conversations MODIFY COLUMN client_state ENUM('lead', 'trial', 'active_member', 'inactive_member', 'expired_member') NOT NULL DEFAULT 'lead';
