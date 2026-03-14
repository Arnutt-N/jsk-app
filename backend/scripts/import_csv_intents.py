"""
Import intent data from CSV file
CSV format: intent_category,intent,msg_type,response,...
"""
import asyncio
import csv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Add backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

load_dotenv(backend_dir / ".env")
load_dotenv(backend_dir / "app" / ".env")

from app.models.intent import IntentCategory, IntentKeyword, IntentResponse, MatchType, ReplyType


def get_database_url() -> str:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is required")
    return db_url

async def import_from_csv(csv_path: str):
    """Import intents from CSV file"""
    
    # Create async engine
    engine = create_async_engine(get_database_url(), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            # Clear existing data
            print("🗑️  Clearing existing intent data...")
            await session.execute(text("DELETE FROM intent_responses"))
            await session.execute(text("DELETE FROM intent_keywords"))
            await session.execute(text("DELETE FROM intent_categories"))
            await session.commit()
            print("✅ Cleared existing data\n")
            
            # Read CSV
            categories_dict = {}  # {category_name: {category_obj, keywords: [], responses: []}}
            
            print("📖 Reading CSV file...")
            with open(csv_path, 'r', encoding='utf-8-sig') as f:  # utf-8-sig to handle BOM
                reader = csv.DictReader(f)
                row_count = 0
                skipped_count = 0
                
                for row in reader:
                    category_name = row.get('intent_category', '').strip()
                    keyword = row.get('intent', '').strip()
                    msg_type = row.get('msg_type', 'text').strip().lower()
                    response_text = row.get('response', '').strip()
                    
                    # Debug first 3 rows
                    if row_count < 3:
                        print(f"  Row {row_count + 1}: category='{category_name}', keyword='{keyword}', type='{msg_type}'")
                    
                    # Skip empty rows
                    if not category_name or not keyword:
                        skipped_count += 1
                        continue
                    
                    row_count += 1
                    
                    # Create category if not exists
                    if category_name not in categories_dict:
                        categories_dict[category_name] = {
                            'keywords': set(),
                            'responses': set()
                        }
                    
                    # Add keyword
                    categories_dict[category_name]['keywords'].add(keyword)
                    
                    # Add response (store unique responses)
                    if response_text:
                        categories_dict[category_name]['responses'].add((msg_type, response_text))
            
            print(f"📊 Parsed {row_count} rows from CSV (skipped {skipped_count} empty rows)")
            print(f"📁 Found {len(categories_dict)} unique categories\n")
            
            # Create categories, keywords, and responses
            for category_name, data in categories_dict.items():
                print(f"📦 Creating category: {category_name}")
                
                # Create category
                category = IntentCategory(
                    name=category_name,
                    description=f"Imported from CSV",
                    is_active=True
                )
                session.add(category)
                await session.flush()  # Get ID
                
                # Create keywords
                for keyword in data['keywords']:
                    kw = IntentKeyword(
                        category_id=category.id,
                        keyword=keyword,
                        match_type=MatchType.CONTAINS
                    )
                    session.add(kw)
                
                # Create responses
                for idx, (msg_type, response_text) in enumerate(data['responses']):
                    # Map msg_type to ReplyType
                    reply_type_map = {
                        'text': ReplyType.TEXT,
                        'flex': ReplyType.FLEX,
                        'image': ReplyType.IMAGE,
                        'sticker': ReplyType.STICKER,
                        'video': ReplyType.VIDEO
                    }
                    reply_type = reply_type_map.get(msg_type, ReplyType.TEXT)
                    
                    resp = IntentResponse(
                        category_id=category.id,
                        reply_type=reply_type,
                        text_content=response_text if msg_type == 'text' else None,
                        payload=None,  # Flex payloads are not parsed by this import script.
                        order=idx,
                        is_active=True
                    )
                    session.add(resp)
                
                print(f"   ✓ {len(data['keywords'])} keywords, {len(data['responses'])} responses")
            
            # Commit all
            await session.commit()
            
            print(f"\n🎉 Import complete!")
            print(f"   Categories: {len(categories_dict)}")
            print(f"   Total rows processed: {row_count}")
            
        except Exception as e:
            await session.rollback()
            print(f"\n❌ Import failed: {e}")
            raise
        finally:
            await engine.dispose()

if __name__ == "__main__":
    csv_file = os.getenv(
        "INTENT_CSV_PATH",
        str(backend_dir.parent / "examples" / "moj-skn-bot-examples.csv"),
    )
    
    if not os.path.exists(csv_file):
        print(f"❌ CSV file not found: {csv_file}")
        sys.exit(1)
    
    print("🚀 Starting CSV import...\n")
    asyncio.run(import_from_csv(csv_file))
