from flask import Flask, escape, render_template, request, session, redirect, url_for, flash
from models import Workout, Exercise
from flaskext.mysql import MySQL

app = Flask('SwollTech')
mysql = MySQL()
app.config['MYSQL_DATABASE_USER']= 'root'
app.config['MYSQL_DATABASE_PASSWORD']='Bond7007!'
app.config['MYSQL_DATABASE_DB'] = "swolltech"
app.config['MYSQL_DATABASE_HOST']='localhost'
mysql.init_app(app)
app.secret_key = 'TESTING_KEY_(CHANGE_LATER)'
tentative_exercises_cache = {}

def get_db():
    db = mysql.connect()
    return db
#init_db
connection = get_db()
with open('sql/schema.sql') as f:
    cursor = connection.cursor()

    cursor.execute(f.read())
    connection.commit()
with open('sql/insert_test_data.sql') as i:
    cursor = connection.cursor()
    cursor.execute(i.read())

connection.commit()
connection.close()

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
    tentative_exercises_cache.pop(session['user_id'])
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
def create_workout(exerciseName=None):
    if user_authenticated():
        if tentative_exercises_cache.get(session['user_id']) is None:
            tentative_exercises_cache.update({session['user_id']: []})

        exerciseList = tentative_exercises_cache.get(session["user_id"])
        if exerciseList:
            exerciseName = exerciseList[len(exerciseList-1)]
        return render_template('createworkout.html', exerciseName=exerciseName, exerciseList=exerciseList)
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)

@app.post('/createworkout.html')
def post_create_workout():
    if user_authenticated():
        wo_name = request.form['workout_name']
        session['workout_name']=wo_name
        #start building list  of exercises to go with this new wo


        message = 'Workout created successfully'
        return render_template(url_for('home'), message=message)
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)


@app.get('/addexistingexercise.html')
def add_existing_exercise():
    if user_authenticated():
        list = fetch_users_exercises()

        return render_template(url_for('add_existing_exercise'), list=list)
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)


@app.route('/addexistingexercise.html/')
def post_existing_exercise():
    if user_authenticated():
        exercise_name = request.args.get('ex_name')
        if tentative_exercises_cache.get(session["user_id"]) is None:
            tentative_exercises_cache.update({session['user_id']: []})
        exercise_list = tentative_exercises_cache.get(session["user_id"])
        if len(exercise_list) > 0 and exercise_name == exercise_list[len(exercise_list)-1]:
            message = 'Adding the same exercise back to back is not allowed. Once you start the workout, you can have multiple sets of the exercise instead.'
            render_template(url_for('create_workout'), tentative_exercise_list=exercise_list, message=message, messageCategory='danger')
        exercise_list.append(exercise_name)
        tentative_exercises_cache.update({session['user_id']: exercise_list})
        return render_template(url_for('create_workout'), tentative_exercise_list=exercise_list, message='Exercise added', messageCategory='success')


@app.route('/removeexercise/')
def remove_exercise():
    ex_name = request.args.get('ex_name')
    if user_authenticated():
        if tentative_exercises_cache.get(session['user_id']) is None:
            tentative_exercises_cache.update({session['user_id']: []})
        exercise_list = tentative_exercises_cache.get(session['user_id'])
        exercise_list.remove(ex_name)
        tentative_exercises_cache.update({session['user_id']: exercise_list})
        message = "Exercise removed"
        return render_template(url_for('create_workout'), tentative_exercise_list=exercise_list, message=message, messageCategory='success')

def user_authenticated() -> bool:
    if session.get('user_id') is None:
        return False
    return True


def fetch_users_exercises():
        conn = get_db()
        cursor = conn.cursor()
        query = f"SELECT e.exercise_name, et.exercise_type_name, w.workout_name FROM Users u INNER JOIN Workout w ON u.user_id = w.user_id INNER JOIN Workout_Exercise we ON w.workout_id = we.workout_id INNER JOIN Exercise e ON we.exercise_id = e.exercise_id INNER JOIN Exercise_Type et ON e.exercise_type_id = et.exercise_type_id WHERE w.user_id= {session['user_id']} ORDER BY et.exercise_type_name;"
        results = cursor.execute(query).fetchall()
        return results;
