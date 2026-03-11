import os
import re

base_dir = r"D:\genAI\skn-app\.agent\skills"

done_skills = [
    "fastapi", "frontend-design", "line_flex_message_builder", 
    "websocket_live_chat", "database_migration", "auth_rbac_security",
    "security_checklist", "deployment_devops", "database_postgresql_standard",
    "git_workflow", "agent_collaboration_standard.OLD"
]

updated_count = 0

for item in os.listdir(base_dir):
    if item in done_skills:
        continue
        
    skill_dir = os.path.join(base_dir, item)
    skill_file = os.path.join(skill_dir, "SKILL.md")
    
    if not os.path.isfile(skill_file):
        continue
        
    with open(skill_file, "r", encoding="utf-8") as f:
        content = f.read()

    match = re.match(r"^---\n(.*?)\n---\n(.*)", content, flags=re.DOTALL)
    if not match:
        print(f"Skipping {item} (no standard frontmatter)")
        continue
        
    frontmatter_raw = match.group(1)
    body = match.group(2)
    
    if "Context7 Docs" in body:
        print(f"Skipping {item} (already updated)")
        continue
    
    desc_match = re.search(r"^description:\s*(.*)$", frontmatter_raw, flags=re.MULTILINE)
    desc = desc_match.group(1).strip() if desc_match else f"Reference guidance for {item}"
    
    new_yaml = f"""---
name: {item}
description: >
  {desc}
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, {item.replace('_', '-')}]
---
"""

    context7_insertion = """
## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.
"""

    # Inject Context7 after the first level 1 heading
    def insert_context7(match_obj):
        return match_obj.group(0) + "\n" + context7_insertion

    new_body = re.sub(r"^# .*\n", insert_context7, body, count=1, flags=re.MULTILINE)
    
    if new_body == body:
       new_body = f"# {item}\n{context7_insertion}\n{body}"

    with open(skill_file, "w", encoding="utf-8") as f:
        f.write(new_yaml + new_body)
    
    updated_count += 1
    print(f"Updated: {item}")

print(f"\\nSuccessfully updated {updated_count} skills.")
