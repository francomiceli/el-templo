-- WhatsApp Bot: conversations and messages tables

CREATE TABLE `whatsapp_conversations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) NOT NULL,
  `contact_name` varchar(100) NULL,
  `conversation_status` enum('active','human_takeover','closed') NOT NULL DEFAULT 'active',
  `client_state` enum('lead','trial','active_member','lapsed','returning') NOT NULL DEFAULT 'lead',
  `assigned_admin_id` int NULL,
  `linked_member_id` int NULL,
  `last_message_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `whatsapp_conversations_phone_unique` (`phone`),
  CONSTRAINT `whatsapp_conversations_assigned_admin_id_users_id_fk` FOREIGN KEY (`assigned_admin_id`) REFERENCES `users`(`id`),
  CONSTRAINT `whatsapp_conversations_linked_member_id_users_id_fk` FOREIGN KEY (`linked_member_id`) REFERENCES `users`(`id`),
  KEY `idx_wa_conv_status` (`conversation_status`),
  KEY `idx_wa_conv_linked_member` (`linked_member_id`),
  KEY `idx_wa_conv_last_message` (`last_message_at`)
);

CREATE TABLE `whatsapp_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversation_id` int NOT NULL,
  `message_direction` enum('inbound','outbound_bot','outbound_human') NOT NULL,
  `content` text NOT NULL,
  `wa_message_type` enum('text','image','audio','document','template') NOT NULL DEFAULT 'text',
  `whatsapp_message_id` varchar(100) NULL,
  `metadata` json NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_messages_conversation_id_whatsapp_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `whatsapp_conversations`(`id`),
  KEY `idx_wa_msg_conversation_created` (`conversation_id`, `created_at`),
  KEY `idx_wa_msg_whatsapp_id` (`whatsapp_message_id`)
);
