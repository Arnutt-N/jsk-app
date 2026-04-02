# 📝 Session Summary: WSL Run Commands & Claude Mode Switching
Generated: 2026-01-27 23:31
Agent: Antigravity (Gemini)

## 🎯 Main Objectives
ตอบคำถามเกี่ยวกับคำสั่งต่างๆ สำหรับการรันแอปใน WSL, การ Sync โค้ด, การรับ/ส่งมอบงานระหว่าง Agents และการสลับโหมด Claude

## ✅ Completed Tasks
- [x] ให้คำสั่งรันแอปใน WSL (Native Mode) ตาม `/run-app` workflow
- [x] ให้คำสั่ง Sync เฉพาะ Frontend จาก Windows → WSL
- [x] อธิบายขั้นตอน Pickup งานจาก Claude Code (ตาม `/pickup-from-any`)
- [x] อธิบายขั้นตอนที่ Claude Code ต้องทำเพื่อส่งมอบงาน (ตาม `/handoff-to-any`)
- [x] ให้คำสั่งสลับโหมด Claude (Pro ↔ Z-AI)
- [x] แก้ไขปัญหา `SessionStart:startup hook error` หลังสลับโหมด

## ⚡ Technical State & Decisions
- **Mode**: Z-AI (GLM-4.7) - สลับสำเร็จแล้ว
- **Modified**: `.claude/settings.local.json` - ลบ `enabledPlugins` ที่ทำให้เกิด error
- **Scripts Used**:
  - `secrets/switch-claude.ps1 zai` - สลับไปใช้ Z-AI API
  - `secrets/switch-claude.ps1 pro` - สลับกลับไปใช้ Claude Pro

## 📁 Key Files Referenced
| File | Purpose |
|------|---------|
| `.agents/workflows/run-app.md` | คำสั่งรันแอปใน WSL |
| `.agents/workflows/pickup-from-any.md` | รับงานจาก Agent อื่น |
| `.agents/workflows/handoff-to-any.md` | ส่งมอบงานให้ Agent อื่น |
| `secrets/switch-claude.ps1` | สคริปต์สลับโหมด Claude |

## ⏳ Next Steps / Handover
1. **ถ้าต้องการกลับไปใช้ Claude Pro**: รัน `.\secrets\switch-claude.ps1 pro`
2. **ถ้าต้องการรันแอปใน WSL**: ใช้คำสั่งใน `/run-app` workflow
3. **ถ้าต้องการส่งมอบงานให้ Agent อื่น**: ใช้ `/handoff-to-any` workflow
