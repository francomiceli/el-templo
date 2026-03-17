-- Add raw_payload column and unique constraint on whatsapp_message_id
ALTER TABLE `whatsapp_messages` ADD COLUMN `raw_payload` json NULL;
ALTER TABLE `whatsapp_messages` ADD UNIQUE KEY `whatsapp_messages_whatsapp_message_id_unique` (`whatsapp_message_id`);
