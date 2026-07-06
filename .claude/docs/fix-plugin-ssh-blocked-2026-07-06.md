# แก้ปัญหา: ติดตั้ง Claude Code Plugin ไม่ได้ (SSH port 22 ถูกบล็อก)

> **วันที่:** 2026-07-06 · **เครื่อง:** `MOJ-HRMD-NB84` (สำนักงานปลัดกระทรวงยุติธรรม)
> **เคส:** `/plugin install agent-skills@addy-agent-skills` ล้มเหลว
> **วิธี:** systematic-debugging (หา root cause ก่อนแก้)

---

## TL;DR (สรุปสั้น)

เครือข่ายราชการ **บล็อก SSH port 22** แต่ plugin manager ดัน clone marketplace แบบ `"source": "github"` ผ่าน SSH (`git@github.com:...`) → โดน reset. HTTPS ใช้ได้ปกติ จึงแก้ด้วยการสั่ง git ให้แปลง SSH GitHub URL → HTTPS อัตโนมัติ (global insteadOf rewrite) แล้วติดตั้งผ่าน ✅

**คำสั่งแก้ (คัดลอกไปใช้ได้):**
```bash
git config --global --add url."https://github.com/".insteadOf "git@github.com:"
git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"
```

---

## 1. อาการ (Symptom)

```
Failed to install: Failed to clone repository:
Cloning into 'C:\Users\arnutt.n\.claude\plugins\cache\temp_github_..._dg32yy'...
Connection reset by 20.205.243.166 port 22
fatal: Could not read from remote repository.
```

**เบาะแสสำคัญ:** URL ที่ตั้งใจใช้เป็น HTTPS แต่ error บอก **port 22 (SSH)** — ขัดกัน แปลว่ามีการใช้ SSH ที่ไหนสักแห่ง

---

## 2. การวิเคราะห์หาสาเหตุ (Root Cause Investigation)

เก็บหลักฐานก่อน ห้ามเดา:

| ทดสอบ | คำสั่ง | ผล | แปลว่า |
|-------|--------|-----|--------|
| git rewrite | `git config --global --get-regexp url.` | (none) | ไม่ได้เกิดจาก config เดิม |
| HTTPS → GitHub | `curl ... https://github.com/.../info/refs` | **HTTP 200** | HTTPS ใช้ได้ปกติ |
| SSH port 22 | `ssh -T git@github.com` | **Connection reset :22** | firewall บล็อก SSH 22 |
| SSH port 443 | `ssh -T -p 443 git@ssh.github.com` | ต่อติด (publickey denied) | เครือข่ายเปิด 443 แต่ไม่มี key |
| gh protocol | `gh config get git_protocol` | `https` | gh ไม่ใช่ต้นเหตุ |
| marketplace config | อ่าน `known_marketplaces.json` | `addy-agent-skills` = `"source":"github"` + `repo` | ต่างจากตัวที่ทำงานได้ซึ่งเป็น `"source":"git"` + url HTTPS |

### สาเหตุที่แท้จริง (Root Cause)

Claude Code plugin manager เมื่อเจอ marketplace แบบ **`"source": "github"` + `owner/repo`** จะสร้าง URL เป็น **SSH** (`git@github.com:owner/repo.git`) แล้ว shell ไปเรียก `git clone` → ยิง **port 22** → เครือข่าย MOJ reset → ติดตั้งล้มเหลว

(marketplace แบบ `"source": "git"` + URL เต็ม `https://...git` ใช้ HTTPS อยู่แล้ว จึงไม่มีปัญหา — สังเกตได้ว่าตัวพวกนี้ติดตั้งสำเร็จหมด)

---

## 3. วิธีแก้ (Solution)

สั่ง git ให้แปลง SSH GitHub URL ทุกแบบ → HTTPS อัตโนมัติ (ระดับ global):

```bash
git config --global --add url."https://github.com/".insteadOf "git@github.com:"
git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"
```

> ⚠️ **ต้องใช้ `--add` ทั้ง 2 บรรทัด** — เพราะทั้งคู่เขียนลง key เดียวกัน (`url.https://github.com/.insteadOf` เป็น multi-value) ถ้าใช้ `git config` ธรรมดา บรรทัดที่ 2 จะ **ทับ** บรรทัดที่ 1 (เจอปัญหานี้จริงตอนแก้รอบแรก)

**ปลอดภัยไหม?** ปลอดภัยบนเครือข่ายนี้ เพราะ SSH ถูกบล็อกอยู่แล้ว (ใช้ไม่ได้อยู่ดี) และ push/pull ยังทำผ่าน HTTPS + `gh` auth ได้ครบ (scopes: repo, workflow, gist, read:org)

---

## 4. การพิสูจน์ (Verification)

```bash
# 4.1 ต้องเห็นครบ 2 ค่า
git config --global --get-all url."https://github.com/".insteadOf
#   git@github.com:
#   ssh://git@github.com/

# 4.2 ยิง URL แบบ SSH แล้วต้องวิ่งผ่าน HTTPS สำเร็จ (exit 0)
git ls-remote "git@github.com:addyosmani/agent-skills.git" HEAD
#   8c6530305396f341b5da7201cf1f7e390fdb863f  HEAD   <-- สำเร็จ
```

---

## 5. ผลลัพธ์ (Result)

```
/plugin install agent-skills@addy-agent-skills
✓ Installed agent-skills. Run /reload-plugins to apply.
```

ต่อด้วย `/reload-plugins` เพื่อเปิดใช้งาน ✅

---

## 6. บทเรียน (Lessons Learned)

1. **error บอก port** — `port 22` = SSH, `port 443` = HTTPS ช่วยชี้ทิศทางทันที
2. **เดาว่า "เสร็จ" ไม่พอ ต้องทดสอบจริง** — fix รอบแรก (ไม่มี `--add`) ดูเหมือนสำเร็จ แต่ค่าที่ 2 ทับค่าที่ 1 ทำให้ยังพัง จับได้เพราะมี Verification step
3. **แก้ที่ root ครอบทุกเคส** — insteadOf rewrite แก้ครั้งเดียว ครอบ marketplace แบบ github ทุกตัว + ทุก `git clone`/`npm install` ที่เผลอใช้ SSH URL ในอนาคต

---

## 7. ทางเลือกสำรอง (Alternatives)

| วิธี | ข้อดี | ข้อเสีย |
|------|-------|---------|
| **insteadOf rewrite** (ที่ใช้) | แก้ครั้งเดียว ครอบทุกเคส ไม่ต้องมี SSH key | เปลี่ยน git config ทั้งเครื่อง |
| re-add marketplace ด้วย URL เต็ม `https://...git` | แก้เฉพาะจุด ไม่แตะ config รวม | ต้องทำทีละ marketplace |
| SSH-over-443 (`~/.ssh/config` + key) | ใช้ SSH ได้จริง | ต้องสร้าง/อัปโหลด SSH key ขึ้น GitHub เพิ่ม |

**คำสั่ง re-add (ถ้าเลือกวิธีสำรอง):**
```
/plugin marketplace remove addy-agent-skills
/plugin marketplace add https://github.com/addyosmani/agent-skills.git
/plugin install agent-skills@addy-agent-skills
```
