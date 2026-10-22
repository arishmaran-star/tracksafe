import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

# 1. Turn on the .env reader
load_dotenv()

# 2. Grab the secret URL from the .env file
DATABASE_URL = os.getenv("DATABASE_URL")

# 3. Create the connection function
def get_db_connection():
    """
    Creates and returns a raw connection to the Supabase PostgreSQL database.
    RealDictCursor ensures rows are returned as Python dictionaries.
    """
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return conn