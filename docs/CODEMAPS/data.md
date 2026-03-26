<!-- Generated: 2026-03-26 | Files scanned: 50 | Token estimate: ~700 -->
# Data Codemap

## Database: PostgreSQL (async via asyncpg + SQLAlchemy 2.0)

## Tables (24 models)

### Core Entities
```
users                    id, line_user_id, username, email, hashed_password,
                         role (SUPER_ADMIN|ADMIN|AGENT|USER), chat_mode (BOT|HUMAN),
                         friend_status, organization_id
                         → has_many: requests, sessions, audit_logs, tags

service_requests         id, requester_id, line_user_id, requester_name,
                         phone_number, email, agency, province, district,
                         topic_category, subcategory,
                         status (PENDING|IN_PROGRESS|COMPLETED|REJECTED),
                         priority (LOW|MEDIUM|HIGH|URGENT), assigned_agent_id
                         → belongs_to: requester(User), assignee(User)

organizations            id, name, email, phone → has_many: users
```

### Messaging
```
messages                 id, line_user_id, direction (INCOMING|OUTGOING),
                         message_type, content, payload (JSONB),
                         sender_role (USER|BOT|ADMIN), operator_name

chat_sessions            id, line_user_id, operator_id,
                         status (WAITING|ACTIVE|CLOSED),
                         started_at, claimed_at, closed_at, first_response_at,
                         message_count, transfer_count
                         → belongs_to: operator(User), has_many: csat_responses

broadcasts               id, title, message, scheduled_at, sent_at,
                         status, recipient_count
```

### Chatbot & Responses
```
intent_categories        id, name, description, is_active
                         → has_many: keywords, responses

intent_keywords          id, category_id, keyword,
                         match_type (EXACT|CONTAINS|REGEX|STARTS_WITH)

intent_responses         id, category_id, reply_type, text_content,
                         media_id, payload (JSONB), order

auto_replies             id, keyword, response, match_type, is_active
reply_objects            id, object_id, name, category,
                         object_type (TEXT|FLEX|IMAGE|STICKER|VIDEO|AUDIO|LOCATION|IMAGEMAP),
                         payload (JSONB), is_active
canned_responses         id, title, content, category
```

### Media & Files
```
media_files              id (UUID), filename, mime_type, size_bytes,
                         category (IMAGE|VIDEO|AUDIO|DOCUMENT|OTHER),
                         is_public, public_token, thumbnail_url
```

### User Management
```
tags                     id, name, color
user_tags                user_id, tag_id (composite PK, many-to-many)
friend_events            id, line_user_id, event_type (FOLLOW|UNFOLLOW|BLOCK|UNBLOCK)
```

### Analytics & Audit
```
chat_analytics           id, date, total_sessions, active_sessions,
                         avg_frt, avg_resolution_time
csat_responses           id, session_id, score (1-5), feedback
audit_logs               id, admin_id, action, resource_type, resource_id,
                         old_value, new_value → belongs_to: admin(User)
```

### Configuration
```
credentials              id, credential_type, key, secret, is_active
system_settings          id, key, value, description
business_hours           id, day_of_week, start_time, end_time, is_enabled
rich_menus               id, line_rich_menu_id, name, is_active, sync_status
```

### Geography
```
provinces                id, name_th, name_en
districts                id, province_id, name_th, name_en → belongs_to: province
sub_districts            id, district_id, name_th, name_en → belongs_to: district
```

### Other
```
bookings                 id, user_id, booking_date, start_time, end_time, status
request_comments         id, request_id, user_id, comment
```

## Entity Relationships

```
User ──< ServiceRequest (requester_id, assigned_agent_id)
User ──< ChatSession (operator_id)
User >──< Tag (via user_tags)
User ──< AuditLog (admin_id)
ChatSession ──< CsatResponse (session_id)
IntentCategory ──< IntentKeyword (category_id)
IntentCategory ──< IntentResponse (category_id)
Province ──< District (province_id) ──< SubDistrict (district_id)
Organization ──< User (organization_id)
```

## Migrations

**26 Alembic migrations** in `backend/alembic/versions/`
- Initial schema → messages → media → audit/CSAT → rich menus → tags → indexes
- 2 merge migrations for conflict resolution
- Recent: timezone support, sender roles, friend event columns
