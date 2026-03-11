---
name: line_integration
description: >
  Best practices for implementing LINE Messaging API and LIFF within the application.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, line-integration]
---

# LINE Integration Standards


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## 1. Webhook Security
- **Signature Validation**: ALWAYS validate the `x-line-signature` header in the middleware before processing any event.
- **Replay Attacks**: Check timestamp if possible (optional but recommended).

## 2. Flex Message Architecture
- **Do NOT** hardcode large JSON objects in Python/JavaScript logic.
- **Strategy**:
    - Store Flex templates in Database (table: `flex_templates`) or JSON files.
    - Use placeholders (`{{ name }}`, `{{ date }}`) and replace them at runtime.
    - This allows updating the design without redeploying code.

## 3. LIFF & Mini App
- **Authentication**:
    - Use `liff.init({ liffId: ... })`.
    - If `!liff.isLoggedIn()`, call `liff.login()`.
    - Get ID Token -> Send to Backend -> Verify with LINE API -> Issue Session JWT.
    - **Never** trust `liff.getDecodedIDToken()` on the client side for sensitive operations; verify on backend.

## 4. Rate Limiting & Queueing
- When broadcasting or sending Push Messages to many users, use a **Queue** (e.g., Celery or BullMQ).
- Respect LINE API Rate Limits (check headers `x-line-ratelimit-remaining`).

## 5. Event Handling Pattern
- Use the **Observer Pattern** or **Event Bus**.
- Controller receives Webhook -> Publishes Event (`MessageReceived`) -> Listeners handle logic (e.g., `SaveToDB`, `CheckAutoReply`, `NotifyAdmin`).
- Decouples response time from processing time.
