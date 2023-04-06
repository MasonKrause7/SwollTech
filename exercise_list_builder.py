import sqlite3

def get_conn():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn

class ListBuilder:
    list = []

    def fetch_users_exercises(self):
        conn = get_conn()
        cursor = conn.cursor()
        query = f"SELECT e.exercise_name, et.exercise_type_name, w.workout_name FROM Users u INNER JOIN Workout w ON u.user_id = w.user_id INNER JOIN Workout_Exercise we ON w.workout_id = we.workout_id INNER JOIN Exercise e ON we.exercise_id = e.exercise_id INNER JOIN Exercise_Type et ON e.exercise_type_id = et.exercise_type_id WHERE w.user_id= {session['user_id']};"
        results = cursor.execute(query).fetchall()
        return results;
