-- Track media kind (image vs video) for "media before text" WhatsApp sessions.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pending_whatsapp_media_type TEXT;

COMMENT ON COLUMN sessions.pending_whatsapp_media_type IS 'WhatsApp media type for pending_whatsapp_media_id: image or video. Defaults to image when null.';
