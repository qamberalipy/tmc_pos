import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

DB_URI = os.getenv("DB_URI")

class Config:
    print("Using database URI:", DB_URI)
    SQLALCHEMY_DATABASE_URI = DB_URI
    SQLALCHEMY_TRACK_MODIFICATIONS = False
