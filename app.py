from flask import Flask, g, escape, render_template, request, session, redirect, url_for, flash
from passlib.hash import pbkdf2_sha256
import pyodbc
from models import Workout, Exercise

app = Flask('SwollTech')

laptopserver='(LocalDB)\MSSQLLocalDB'
desktopserver='localhost'
database='swolltech'
laptopusername='DESKTOP-02M87G6\mason'
desktopusername='MGK777\mason'

cnxnstr = f"DRIVER={'{ODBC Driver 18 for SQL Server}'}; SERVER={desktopserver};DATABASE={database};UID={desktopusername}; ENCRYPT=Optional; Trusted_connection=Yes"
app.secret_key = 'TESTING_KEY_(CHANGE_LATER)'

tentative_exercises_cache = {}
users_existing_exercises_cache = {}

def get_db():
    connection = pyodbc.connect(cnxnstr)
    return connection

def init_db():
    cnxn = pyodbc.connect(cnxnstr)
    cursor = cnxn.cursor()
    cursor.execute('EXEC init_db')
    cnxn.commit()
    print('Tables created...')
    hash = pbkdf2_sha256.hash('pass')
    query = f"INSERT INTO Users(fname, lname, email, dob, password) VALUES ('Mason', 'Krause', 'masongkrause@yahoo.com', '03-20-1995', '{hash}')"
    cursor.execute(query)
    cnxn.commit()
    print('User added...')
    with open('sql/insert_test_data.sql') as f:
        cursor.execute(f.read())
    cnxn.commit()
    cnxn.close()

@app.route('/')
def index():
    if user_authenticated():
        return render_template('home.html')
    return render_template('index.html')
@app.route('/api/init_db')
def api_init_db():
    init_db()
    if user_authenticated():
        return render_template('home.html')
    return render_template('index.html', message='DB initialized')

@app.route('/about.html')
def about():
    return render_template('about.html')


@app.get('/signup.html')
def get_signup():
    return render_template('signup.html')


@app.post('/signup.html')
def post_signup():
    # NEED TO VALIDATE REGISTRATION DATA
    #collecting form data
    fname = request.form['fname']
    lname = request.form['lname']
    email = request.form['email']
    dob = request.form['dob']
    password = request.form['pass']
    confPassword = request.form['confpass']
    if (password != confPassword):
        message = "Password and confirmation do not match, please try again"
        return render_template(url_for('get_signup'), message=message, fname=fname, lname=lname, email=email, dob=dob, password=password)
    #check if user exists in db
    successfulInsert = False
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"SELECT * FROM Users WHERE email='{email}'"
    results = cursor.execute(query)
    users = results.fetchall()
    if len(users) > 0:  # if user already exists, render login
        user = users[0]
        message = "That email is already associated with an account, please log in"
        return render_template('login.html', message=message)
    else: #valid new user, try adding to db
        message = ""
        try:
            hashword = pbkdf2_sha256.hash(password)
            query = f"INSERT INTO Users (fname, lname, email, dob, password) VALUES ('{fname}', '{lname}', '{email}', '{dob}', '{hashword}')"
            cursor.execute(query)
            cnxn.commit()
            print("record added successfully")
            message = "Sign up successful. Please log in to your new account"
            cnxn.close()
            return render_template(url_for('login'), message=message)

        except:
            cnxn.rollback()
            message = "There was an error during the sign up process. Please try again."
            print('error inserting record')
            cnxn.close()
            return render_template(url_for('get_signup'), message=message)


@app.route('/login.html', methods=['GET', 'POST'])
def login(user=None, message=""):
    if request.method == 'GET':
        return render_template('login.html', message=message)
    else:
        username = request.form.get('username')
        password = request.form.get('loginpassword')
        userExists = False
        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f"SELECT * FROM Users WHERE email= '{username}'"
        results = cursor.execute(query)
        result = results.fetchall()
        cnxn.close()
        if len(result) == 0:
            message = "No user exists with that email, please try again"
            return render_template(url_for('login'), message=message)
        else:
            user = result[0]
            if pbkdf2_sha256.verify(password, user[5]):
                session['logged_in'] = True
                session['user_id'] = user[0]
                session['email'] = user[3]
                session['fname'] = user[1]
                session['lname'] = user[2]
                return redirect(url_for('home'))
            else:
                message = "Sorry, that password is incorrect."
                return render_template(url_for('login'), message=message)


@app.route('/logout')
def logout():
    if len(session.keys()) == 0:
        message = 'You were not logged in'
        return render_template('index.html', message=message)
    session.clear()

    message = 'Successfully signed out'
    return render_template('index.html', message=message)


@app.route('/home.html')
def home(message=None):
    if not user_authenticated():
        message = 'You must be logged in to access your home page'
        return render_template(url_for('login'), message=message)
    # query relevant homepage data
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"SELECT * FROM Sesh s INNER JOIN workout w ON s.workout_id = w.workout_id WHERE s.user_id = {session['user_id']};"
    results = cursor.execute(query).fetchall()
    cnxn.close()
    numResults = len(results)
    return render_template('home.html', seshList=results, numResults=numResults, message=message)


@app.get('/createworkout.html')
def create_workout():
    if user_authenticated():
        g = fetch_users_exercises()
        if 'tentative_exercises' not in session.keys():
            session['tentative_exercises']=[]
        exerciseList = session['tentative_exercises']
        return render_template('createworkout.html', exerciseList=exerciseList, existingExercises=g)
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)

@app.post('/createworkout.html/')
def post_create_workout():
    if user_authenticated():
        wo_name = request.args.get('wo_name')
        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f"EXEC build_workout_return_woID {wo_name}, {session['user_id']}"
        workout_id = cursor.execute(query)
        #workout created, use workout_id to associate exercises to workout
        #build individual exercises
        existingExercises = fetch_users_exercises()
        existingExerciseNames = []
        for ex in existingExercises:
            existingExerciseNames.append(ex.exercise_name)
        for exName in session['tentative_exercises']:
            if exName

        message = 'Workout created successfully'
        return render_template(url_for('home'), message=message)
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)


@app.route('/addexistingexercise.html/')
def post_existing_exercise():
    if user_authenticated():
        exercise_name = request.args.get('ex_name')
        if 'tentative_exercises' not in session.keys():
            session['tentative_exercises'] = [exercise_name]
        exercise_list = session['tentative_exercises']
        exercise_list.append(exercise_name)
        session['tentative_exercises'] = exercise_list
        existingExercises = fetch_users_exercises()
        return render_template(url_for('create_workout'), tentative_exercise_list=exercise_list, message='Exercise added', messageCategory='success', existingExercises=g)


@app.get('/createexercise.html')
def create_exercise():

    return render_template('createexercise.html')

@app.route('/removeexercise/')
def remove_exercise():
    ex_name = request.args.get('ex_name')
    if user_authenticated():
        g = fetch_users_exercises()
        if 'tentative_exercises' not in session.keys:
            session['tentative_exercises'] = []
        exercise_list = session['tentative_exercises']
        if  ex_name in exercise_list:
            exercise_list.remove(ex_name)
            session['tentative_exercises'] = exercise_list
            message = "Exercise removed"
            return render_template(url_for('create_workout'), tentative_exercise_list=exercise_list, message=message,
                                   messageCategory='success', existingExercises=g)
        else:
            message = 'No exercise by that name in tentative exercise list'
            return render_template(url_for('create_workout'), tentative_exercise_list=exercise_list, message=message,existingExercises=g)



def user_authenticated() -> bool:
    if session.get('user_id') is None:
        return False
    return True


def fetch_users_exercises():
        conn = get_db()
        cursor = conn.cursor()
        query = "EXEC fetch_user_exercises "+str(session['user_id'])
        results = cursor.execute(query).fetchall()
        return results;
