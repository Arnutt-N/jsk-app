-- Replace the placeholder value before running this script.
INSERT INTO system_settings (key, value, description)
VALUES ('LINE_CHANNEL_ACCESS_TOKEN', '__REPLACE_WITH_LINE_CHANNEL_ACCESS_TOKEN__', 'LINE Access Token')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
