# Advanced MIS — MySQL Database Create Statements & Schema

This document contains the complete **MySQL DDL (Create Table Statements)** and initialization queries required to set up the **Advanced MIS** database on any MySQL / MariaDB server.

---

## 1. Database Creation

```sql
CREATE DATABASE IF NOT EXISTS `advance_erp` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `advance_erp`;
```

---

## 2. Table Create Statements (DDL)

```sql
-- --------------------------------------------------------
-- 1. Users Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `role` VARCHAR(100) DEFAULT NULL,
  `department` VARCHAR(100) DEFAULT NULL,
  `active` TINYINT(1) DEFAULT '1',
  `password_hash` TEXT,
  `commodities` TEXT,
  `backup_of` VARCHAR(255) DEFAULT NULL,
  `last_login` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 2. Master Log Table (Core Updates & Historical Tracking)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `master_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `log_id` VARCHAR(255) DEFAULT NULL,
  `timestamp_submitted` DATETIME DEFAULT NULL,
  `submitted_by_email` VARCHAR(255) DEFAULT NULL,
  `on_behalf_of_email` VARCHAR(255) DEFAULT NULL,
  `on_behalf_of_name` VARCHAR(255) DEFAULT NULL,
  `entry_type` VARCHAR(100) DEFAULT NULL,
  `entry_date` DATE DEFAULT NULL,
  `week_number` INT DEFAULT NULL,
  `month_year` VARCHAR(20) DEFAULT NULL,
  `topic` VARCHAR(255) DEFAULT NULL,
  `sub_topic` VARCHAR(255) DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'Pending',
  `data_count` INT DEFAULT '0',
  `mode_or_extra` VARCHAR(255) DEFAULT NULL,
  `remarks` TEXT,
  `is_late` TINYINT(1) DEFAULT '0',
  `time_to_submit_min` INT DEFAULT '0',
  `row_status` VARCHAR(50) DEFAULT 'Active',
  `source_url` TEXT,
  `confidence` VARCHAR(50) DEFAULT NULL,
  `validated_by_email` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_entry_date` (`entry_date`),
  KEY `idx_on_behalf_email` (`on_behalf_of_email`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 3. Reports Schedule & Config Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reports` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `deadline` VARCHAR(50) DEFAULT NULL,
  `primary_assignee` TEXT,
  `frequency` VARCHAR(50) DEFAULT 'Daily',
  `backup_1` VARCHAR(255) DEFAULT NULL,
  `backup_2` VARCHAR(255) DEFAULT NULL,
  `schedule_day` VARCHAR(100) DEFAULT NULL,
  `instructions` TEXT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 4. Report Components Breakdown
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `report_components` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `report_name` VARCHAR(255) NOT NULL,
  `component_name` VARCHAR(255) NOT NULL,
  `assignee` VARCHAR(255) DEFAULT NULL,
  `min_count` INT DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_report_name` (`report_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 5. Commodity Configs (Data Update Factors)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `commodity_configs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `commodity` VARCHAR(255) NOT NULL,
  `type` VARCHAR(100) NOT NULL,
  `factor` VARCHAR(255) NOT NULL,
  `primary_assignee` VARCHAR(255) DEFAULT NULL,
  `mode` VARCHAR(255) DEFAULT NULL,
  `is_mandatory` TINYINT(1) DEFAULT '1',
  `schedule_day` VARCHAR(100) DEFAULT NULL,
  `instructions` TEXT,
  PRIMARY KEY (`id`),
  KEY `idx_commodity` (`commodity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 6. Task Templates
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_templates` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `assignee` TEXT,
  `priority` VARCHAR(50) DEFAULT 'Medium',
  `recurrence` VARCHAR(50) DEFAULT 'Daily',
  `due_date` VARCHAR(50) DEFAULT NULL,
  `backup_1` VARCHAR(255) DEFAULT NULL,
  `backup_2` VARCHAR(255) DEFAULT NULL,
  `schedule_day` VARCHAR(100) DEFAULT NULL,
  `instructions` TEXT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 7. Report Groups
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `report_groups` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `parent_category` VARCHAR(255) DEFAULT NULL,
  `group_name` VARCHAR(255) NOT NULL,
  `members` TEXT,
  `frequency` VARCHAR(50) DEFAULT 'Daily',
  `primary_assignee` TEXT,
  `visibility` VARCHAR(50) DEFAULT 'Public',
  `remark` TEXT,
  `created_by` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `backup_1` VARCHAR(255) DEFAULT NULL,
  `backup_2` VARCHAR(255) DEFAULT NULL,
  `schedule_day` VARCHAR(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 8. Roster Configs
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roster_configs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `role` VARCHAR(255) NOT NULL,
  `employee` VARCHAR(255) NOT NULL,
  `frequency` VARCHAR(50) DEFAULT 'Weekly',
  `remark` TEXT,
  `schedule_day` VARCHAR(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 9. Roster Logs
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roster_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `date` DATE NOT NULL,
  `role` VARCHAR(255) NOT NULL,
  `employee` VARCHAR(255) NOT NULL,
  `status` VARCHAR(50) DEFAULT 'Scheduled',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 10. Handover Notes
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `handover_notes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `sender_email` VARCHAR(255) NOT NULL,
  `recipient_email` VARCHAR(255) NOT NULL,
  `notes` TEXT,
  `status` VARCHAR(50) DEFAULT 'Pending',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `acknowledged_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 11. Chat Channels
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `chat_channels` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `is_private` TINYINT(1) DEFAULT '0',
  `created_by` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 12. Chat Messages
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `channel_id` BIGINT DEFAULT NULL,
  `sender_email` VARCHAR(255) NOT NULL,
  `recipient_email` VARCHAR(255) DEFAULT NULL,
  `content` TEXT NOT NULL,
  `attachment_path` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_channel` (`channel_id`),
  KEY `idx_sender` (`sender_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 13. Notifications
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_email` VARCHAR(255) NOT NULL,
  `type` VARCHAR(100) DEFAULT 'info',
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT,
  `link` TEXT,
  `read` TINYINT(1) DEFAULT '0',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_read` (`user_email`, `read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 14. Audit Logs
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `user_email` VARCHAR(255) DEFAULT NULL,
  `action` VARCHAR(255) DEFAULT NULL,
  `target_type` VARCHAR(100) DEFAULT NULL,
  `target_id` VARCHAR(255) DEFAULT NULL,
  `changes_json` TEXT,
  `ip_address` VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 15. Email Logs
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `email_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `recipient` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(255) DEFAULT NULL,
  `body` LONGTEXT,
  `status` VARCHAR(50) DEFAULT 'Pending',
  `error_message` TEXT,
  `sent_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 16. App Settings
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(255) NOT NULL,
  `value` TEXT,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 17. Module Toggles
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `module_toggles` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `module_key` VARCHAR(100) NOT NULL,
  `enabled` TINYINT(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_module_key` (`module_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 18. Kanban Tasks
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `kanban_tasks` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `task_id` VARCHAR(255) DEFAULT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `assigned_to` VARCHAR(255) DEFAULT NULL,
  `assigned_to_name` VARCHAR(255) DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'Backlog',
  `priority` VARCHAR(50) DEFAULT 'Medium',
  `due_date` DATE DEFAULT NULL,
  `created_by` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `tags` TEXT,
  `sprint_id` VARCHAR(100) DEFAULT NULL,
  `story_points` INT DEFAULT '1',
  `comments_json` LONGTEXT,
  `department` VARCHAR(100) DEFAULT NULL,
  `depends_on` VARCHAR(255) DEFAULT NULL,
  `blocked_reason` TEXT,
  `remark` TEXT,
  `position` INT DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 19. Sprints
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sprints` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `sprint_id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `start_date` DATE DEFAULT NULL,
  `end_date` DATE DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'Active',
  `goal` TEXT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 20. MIS Report Uploads & Templates
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `mis_report_uploads` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `filename` VARCHAR(255) DEFAULT NULL,
  `original_filename` VARCHAR(255) DEFAULT NULL,
  `report_type` VARCHAR(100) DEFAULT NULL,
  `uploaded_by` VARCHAR(255) DEFAULT NULL,
  `upload_date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `file_size` INT DEFAULT '0',
  `parsed` TINYINT(1) DEFAULT '0',
  `analysis_json` LONGTEXT,
  `summary` TEXT,
  `quality_score` INT DEFAULT '0',
  `sections_found` TEXT,
  `sections_missing` TEXT,
  `tables_count` INT DEFAULT '0',
  `charts_count` INT DEFAULT '0',
  `commentary_status` VARCHAR(100) DEFAULT NULL,
  `validation_results` LONGTEXT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mis_templates` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `report_type` VARCHAR(100) NOT NULL,
  `layout_config` LONGTEXT,
  `created_by` VARCHAR(255) DEFAULT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mis_llm_feedback` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `report_type` VARCHAR(100) DEFAULT NULL,
  `upload_id` INT DEFAULT NULL,
  `section` VARCHAR(255) DEFAULT NULL,
  `verdict` VARCHAR(50) DEFAULT NULL,
  `reason` TEXT,
  `feedback` TEXT,
  `notes` TEXT,
  `user_email` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 21. Task Overrides & Schedule Overrides
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_overrides` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entity_type` VARCHAR(100) DEFAULT NULL,
  `entity_key` VARCHAR(255) DEFAULT NULL,
  `sub_key` VARCHAR(255) DEFAULT NULL,
  `period_key` VARCHAR(50) DEFAULT NULL,
  `new_date` DATE DEFAULT NULL,
  `reason` TEXT,
  `created_by` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_schedule_overrides` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_email` VARCHAR(255) NOT NULL,
  `entity_type` VARCHAR(100) DEFAULT NULL,
  `entity_key` VARCHAR(255) DEFAULT NULL,
  `sub_key` VARCHAR(255) DEFAULT NULL,
  `frequency` VARCHAR(50) DEFAULT NULL,
  `schedule_day` VARCHAR(100) DEFAULT NULL,
  `reason` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 3. Initial Seed Data Queries

Run these queries to populate default settings, default admin login, and module toggles:

```sql
-- Default SuperAdmin User (login: nishant@agalabs.com / admin123)
INSERT INTO `users` (`email`, `name`, `role`, `department`, `active`, `password_hash`) 
VALUES ('nishant@agalabs.com', 'Nishant', 'SuperAdmin', 'Research', 1, 'admin123')
ON DUPLICATE KEY UPDATE `role`='SuperAdmin', `active`=1;

-- Default Application Settings
INSERT INTO `app_settings` (`key`, `value`) VALUES
('windowStart', '00:01'),
('windowEnd', '23:59'),
('managerEmail', 'ram@agalabs.com'),
('escalateDays', '3'),
('lockDuplicate', 'YES'),
('requireRemarks', 'NO'),
('skipWeekends', 'YES'),
('emailDigestEnabled', 'YES'),
('smtpHost', 'smtp.gmail.com'),
('smtpPort', '465'),
('smtpUser', 'massage.agalabs@gmail.com'),
('smtpPassword', 'zlwh sntt unny vajo'),
('smtpFrom', 'massage.agalabs@gmail.com')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- Default Enabled Modules
INSERT INTO `module_toggles` (`module_key`, `enabled`) VALUES
('dashboard', 1),
('tasks', 1),
('kanban', 1),
('chat', 1),
('analytics', 1),
('mis', 1),
('roster', 1),
('admin', 1),
('du', 1),
('task', 1),
('team', 1),
('coverage', 1),
('crossval', 1),
('audit', 1)
ON DUPLICATE KEY UPDATE `enabled` = VALUES(`enabled`);
```
