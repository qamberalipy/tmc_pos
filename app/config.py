import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

DB_URI = os.getenv("DB_URI")

class Config:
    # print("Using databa?se URI:", DB_URI)
    SQLALCHEMY_DATABASE_URI = DB_URI
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # THE FIX: Tell SQLAlchemy to handle Neon's serverless connection drops
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,  # Ping the DB first; if dead, grab a fresh one transparently
        "pool_recycle": 300,    # Recycle connections every 5 minutes before Neon kills them
        "pool_timeout": 30,     # Wait up to 30 seconds for a connection during cold starts
        "pool_size": 10,        # Standard connection pool size
        "max_overflow": 5,      # Allow 5 extra connections during traffic spikes
    }