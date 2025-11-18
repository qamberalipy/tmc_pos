from key import DB_URI

# DB_USERNAME = os.getenv('DB_USERNAME', 'root')
# DB_PASSWORD = os.getenv('DB_PASSWORD', 'Admin!123')
# DB_HOST = os.getenv('DB_HOST', 'localhost')
# DB_PORT = os.getenv('DB_PORT', '3306')
# DB_NAME = os.getenv('DB_NAME', 'db_tmc')

class Config:
    print("Using database URI:", DB_URI)
    SQLALCHEMY_DATABASE_URI = DB_URI
    SQLALCHEMY_TRACK_MODIFICATIONS = False




