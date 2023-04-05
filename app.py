from flask import Flask, render_template, request, session, redirect, url_for, flash
import sqlite3
from models import Workout, Exercise

app = Flask('SwollTech')
DATABASE = 'database.db'
app.secret_key = 'TESTING_KEY_(CHANGE_LATER)'


def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    return db


@app.route('/')
def index():
    if user_authenticated():
        return render_template('home.html')
    return render_template('index.html')


@app.route('/about.html')
def about():
    return render_template('about.html')


@app.get('/signup.html')
def get_signup(message=None, fname=None, lname=None, dob=None, password=None):
    return render_template('signup.html', message=message)


@app.post('/signup.html')
def post_signup():
    # NEED TO VALIDATE REGISTRATION DATA
    fname = request.form['fname']
    lname = request.form['lname']
    email = request.form['email']
    dob = request.form['dob']
    password = request.form['pass']
    confPassword = request.form['confpass']
    if (password != confPassword):
        message = "Password and confirmation do not match, please try again"
        return render_template(url_for('get_signup'), message=message, fname=fname, lname=lname, email=email, dob=dob, password=password)
    successfulInsert = False
    db = get_db()
    cursor = db.cursor()
    query = f"SELECT * FROM Users WHERE email='{email}'"
    results = cursor.execute(query)
    users = results.fetchall()
    if len(users) > 0:  # if user already exists, render login
        user = users[0]
        message = "That email is already associated with an account, please log in"
        return render_template('login.html', message=message)
    else:
        message = ""
        try:
            #NEED TO ENCRYPT PASSWORD HERE
            query = f"INSERT INTO Users (fname, lname, email, dob, password) VALUES ('{fname}', '{lname}', '{email}', '{dob}', '{password}')"
            cursor.execute(query)
            db.commit()
            print("record added successfully")
            message = "Sign up successful. Please log in to your new account"
            successfulInsert = True
        except:
            db.rollback()
            message = "There was an error during the sign up process. Please try again."
            print('error inserting record')
        finally:
            db.close()

        return render_template(url_for('login'), message=message)


@app.route('/login.html', methods=['GET', 'POST'])
def login(user=None, message=""):
    if request.method == 'GET':
        return render_template('login.html', message=message)
    else:
        username = request.form.get('username')
        password = request.form.get('loginpassword')
        userExists = False
        connection = get_db()
        cursor = connection.cursor()
        query = f"SELECT * FROM Users WHERE email= '{username}'"
        results = cursor.execute(query)
        result = results.fetchall()
        if len(result) == 0:
            message = "No user exists with that email, please try again"
            return render_template(url_for('login'), message=message)
        else:
            user = result[0]
            passwordInDb = user['password']
            if passwordInDb == password:
                session['logged_in'] = True
                session['user_id'] = user['user_id']
                session['email'] = user['email']
                session['fname'] = user['fname']
                session['lname'] = user['lname']
                return redirect(url_for('home'))
            else:
                message = "Sorry, that password is incorrect."
                return render_template(url_for('login'), message=message)


@app.route('/logout')
def logout():
    if len(session.keys()) == 0:
        message = 'You were not logged in'
        return render_template(url_for('login'), message=message)
    session.clear()
    message = 'Successfully signed out'
    return render_template(url_for('login'), message=message)


@app.route('/home.html')
def home(message=None):
    if not user_authenticated():
        message = 'You must be logged in to access your home page'
        return render_template(url_for('login'), message=message)
    # query relevant homepage data
    conn = get_db()
    cursor = conn.cursor()
    query = f"SELECT * FROM Sesh s INNER JOIN workout w ON s.workout_id = w.workout_id WHERE s.user_id = {session['user_id']};"
    results = cursor.execute(query).fetchall()
    numResults = len(results)
    return render_template('home.html', seshList=results, numResults=numResults, message=message)


@app.get('/createworkout.html')
def create_workout():
    if user_authenticated():
        return render_template('createworkout.html')
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)


@app.post('/createworkout.html')
def post_create_workout():
    if user_authenticated():
        wo_name = request.form['workout_name']
        session['workout_name']=wo_name
        #wo is named, start adding exercises

        message = 'Workout created successfully'
        return render_template(url_for('home'), message=message)
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)
def build_workout(workout_name: str, ex_list: [Exercise.Exercise]) -> Workout.Workout:
    wo = Workout.Workout(workout_name)
    for ex in ex_list:
        wo.addExercise(ex)
    return wo
def user_authenticated() -> bool:
    if session.get('user_id') is None:
        return False
    return True
def fetch_users_exercises():
    conn = get_db()
    cursor = conn.cursor()
    query = f"SELECT e.exercise_name, et.exercise_type_name, w.workout_name FROM Users u INNER JOIN Workout w ON u.user_id = w.user_id INNER JOIN Workout_Exercise we ON w.workout_id = we.workout_id INNER JOIN Exercise e ON we.exercise_id = e.exercise_id INNER JOIN Exercise_Type et ON e.exercise_type_id = et.exercise_type_id WHERE w.user_id= {session['user_id']};"
    results = cursor.execute(query).fetchall()
    for result in results:
        print(result.exercise_name)