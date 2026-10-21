import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings

logger = logging.getLogger("focusflow.database")

class MongoDBManager:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None

db_manager = MongoDBManager()

async def connect_to_mongo():
    """Initialize MongoDB connection and create required indexes."""
    try:
        logger.info(f"Connecting to MongoDB at {settings.MONGODB_URL}...")
        db_manager.client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=5000
        )
        db_manager.db = db_manager.client[settings.MONGODB_DB_NAME]
        
        # Test connection ping
        await db_manager.client.admin.command('ping')
        logger.info(f"Successfully connected to MongoDB database: {settings.MONGODB_DB_NAME}")
        
        # Setup indexes
        await setup_indexes()
    except Exception as e:
        logger.warning(f"Could not connect to MongoDB on startup ({e}). App will retry on demand.")

async def close_mongo_connection():
    """Close MongoDB connection pool on shutdown."""
    if db_manager.client:
        logger.info("Closing MongoDB connection...")
        db_manager.client.close()
        logger.info("MongoDB connection closed.")

async def setup_indexes():
    """Create unique and query indexes for Users, Content, Sessions, and Readings."""
    if db_manager.db is None:
        return
    try:
        # Users: unique email
        await db_manager.db.users.create_index("email", unique=True)
        
        # Content: user_id index
        await db_manager.db.content.create_index("user_id")
        
        # Sessions: user_id index, status
        await db_manager.db.sessions.create_index([("user_id", 1), ("started_at", -1)])
        
        # Readings: session_id index
        await db_manager.db.readings.create_index([("session_id", 1), ("timestamp", 1)])
        logger.info("Database indexes verified/created successfully.")
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")

async def ping_database() -> bool:
    """Check if the database is reachable and responsive."""
    if db_manager.client is None:
        return False
    try:
        await db_manager.client.admin.command('ping')
        return True
    except Exception:
        return False

def get_database() -> AsyncIOMotorDatabase:
    """Dependency helper to get the database instance."""
    if db_manager.db is None:
        raise RuntimeError("Database connection is not initialized. Ensure MongoDB is running.")
    return db_manager.db
