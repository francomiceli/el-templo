-- Booking & Attendance Unification
-- Changes booking_status enum to Spanish values and adds new lifecycle states.
-- Migrates existing data from English to Spanish statuses.

-- Step 1: Add new values while keeping old ones (MySQL requires full enum list)
ALTER TABLE bookings MODIFY COLUMN booking_status
  ENUM('confirmed','cancelled','waitlist','no_show','reservado','qr_escaneado','confirmado','cancelado','lista_espera') NOT NULL DEFAULT 'reservado';

-- Step 2: Migrate existing data
UPDATE bookings SET booking_status = 'reservado' WHERE booking_status = 'confirmed';
UPDATE bookings SET booking_status = 'cancelado' WHERE booking_status = 'cancelled';
UPDATE bookings SET booking_status = 'lista_espera' WHERE booking_status = 'waitlist';

-- Step 3: Remove old English values (no_show stays)
ALTER TABLE bookings MODIFY COLUMN booking_status
  ENUM('reservado','qr_escaneado','confirmado','cancelado','lista_espera','no_show') NOT NULL DEFAULT 'reservado';
