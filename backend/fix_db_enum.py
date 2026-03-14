import os
import time

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "app", ".env"))


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required. Set it in the environment or backend/app/.env.")

    return database_url.replace("postgresql+asyncpg://", "postgresql://")

def fix():
    database_url = get_database_url()
    print("Connecting to database...")
    try:
        engine = create_engine(database_url)
        # Check current values
        with engine.connect() as conn:
            print("Checking RequestStatus enum values...")
            try:
                result = conn.execute(text("SELECT unnest(enum_range(NULL::requeststatus))")).fetchall()
                values = [row[0] for row in result]
                print(f"Found values: {values}")
            except Exception as e:
                print(f"Error reading enum: {e}")
                return

            if "AWAITING_APPROVAL" in values:
                print("✅ AWAITING_APPROVAL is ALREADY present.")
                return

        # If we reach here, we need to add it.
        # ALTER TYPE cannot run inside a transaction block.
        print("Attempting to ADD 'AWAITING_APPROVAL'...")
        connection = engine.raw_connection()
        try:
            connection.set_isolation_level(0) # AUTOCOMMIT
            cursor = connection.cursor()
            cursor.execute("ALTER TYPE requeststatus ADD VALUE 'AWAITING_APPROVAL';")
            print("✅ Successfully added 'AWAITING_APPROVAL' to requeststatus enum.")
        except Exception as e:
            print(f"❌ Failed to ALTER TYPE: {e}")
        finally:
            connection.close()
            
    except Exception as e:
        print(f"❌ Critical Error: {e}")

if __name__ == "__main__":
    fix()
