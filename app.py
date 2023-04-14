from flask import Flask, g, escape, render_template, request, session, redirect, url_for, flash
from passlib.hash import pbkdf2_sha256
import pyodbc

app = Flask('SwollTech')

laptopserver='(LocalDB)\MSSQLLocalDB'
desktopserver='localhost'
database='swolltech'
laptopusername='DESKTOP-02M87G6\mason'
desktopusername='MGK777\mason'

cnxnstr = f"DRIVER={'{ODBC Driver 18 for SQL Server}'}; SERVER={laptopserver};DATABASE={database};UID={laptopusername}; ENCRYPT=Optional; Trusted_connection=Yes"
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
    with open('sql/create_account_audit_trigger.sql') as f:
        cursor.execute(f.read())
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
        return render_template('home.html', message='DB initialized', messageCategory='success')
    return render_template('index.html', message='DB initialized', messageCategory='success')

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
    return render_template('index.html', message=message, messageCategory='success')


@app.route('/account.html')
def account():
    if user_authenticated():
        return render_template('account.html')
    else:
        message = 'You must be logged in to view your account. Please log in or register for a free account.'
        return render_template('index.html', message=message, messageCategory='danger')
@app.route('/account.html/')
def edit_account():
    if user_authenticated():
        action = request.args.get('action')
        if action == 'change_email':
            #do something
            return render_template('account.html')
        elif action == 'change_password':
            #change password logic
            return render_template('account.html')
        elif action == 'delete_account':
            flash('Are you sure you want to PERMANENTLY delete your account?\nALL of your workout data will be lost and cannot be recovered.')
            return render_template('deleteaccount.html')
        return render_template('account.html')
    else:
        message = 'You must be logged in to view your account. Please log in or register for a free account.'
        return render_template('index.html', message=message, messageCategory='danger')

@app.route('/deleteaccount/')
def delete_account():
    if user_authenticated():
        user_id = request.args.get('user_id')
        delete_user_account(user_id)
        session.clear()
        message = 'Your account has been deleted. Hope to see you back soon!'
        return render_template('index.html', message=message, messageCategory='success')
    else:
        message = 'You are not logged in to an account. Please log in or sign up to continue.'
        return render_template('index.html', message=message, messageCategory='danger')
@app.route('/home.html/')
def home(message=None):
    if not user_authenticated():
        message = 'You must be logged in to access your home page'
        return render_template(url_for('login'), message=message)
    cnxn = get_db()
    cursor = cnxn.cursor()
    return render_template('home.html', message=message)

@app.route('/viewworkout.html')
def view_workouts(users_workouts=None):
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        return render_template('viewworkout.html', users_workouts=users_workouts)
    else:
        message = 'You must be logged in to view workouts. Please log in or make an account'
        return render_template('index.html', message=message, messageCategory='danger')
@app.route('/viewworkout.html/')
def view_workout():
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        workout_id = request.args.get('workout_id')
        workout_name = request.args.get('workout_name')
        exercises = get_exercises_by_workout(workout_id)
        return render_template('viewworkout.html', users_workouts=users_workouts, exercises=exercises, workout_name=workout_name)
    else:
        message = 'You must be logged in to view workouts. Please log in or make an account'
        return render_template('index.html', message=message, messageCategory='danger')

@app.get('/createworkout.html/')
def create_workout():
    if user_authenticated():
        if 'wo_name' in request.args:
            session['new_workout_name'] = request.args.get('wo_name')
            message = f'Workout named {session["new_workout_name"]} successfully'
        if 'new_exercise_name' in request.args:
            if 'new_exercises' in session.keys():
                new_exercises = session['new_exercises']
                new_exercises.update({request.args.get('new_exercise_name'): request.args.get('new_exercise_type')})
                session['new_exercises'] = new_exercises
                message = 'New exercise added to workout'
                return render_template('createworkout.html', message=message, messageCategory='success')
            else:
                session['new_exercises'] = {request.args.get('new_exercise_name'): request.args.get('new_exercise_type')}
                message = 'New exercise added to workout'
                return render_template('createworkout.html', message=message, messageCategory='success')
        if 'existing_exercise' in request.args:
            if 'existing_exercises' in session.keys():
                existing_exercises = session['existing_exercises']
                existing_exercises.append(request.args.get('existing_exercise'))
                session['existing_exercises'] = existing_exercises
                message = 'Existing exercise added to workout'
                return render_template('createworkout.html', message=message, messageCategory='success')
            else:
                session['existing_exercises'] = [request.args.get('existing_exercise')]
                message = 'Existing exercise added to workout'
                return render_template('createworkout.html', message=message, messageCategory='success')

        return render_template('createworkout.html')
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)
@app.get('/nameworkout.html')
def name_workout():
    if user_authenticated():
        return render_template('nameworkout.html')
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)
@app.route('/remove/')
def remove_exercise():
    if user_authenticated():
        exName = request.args.get('remove')
        if session['existing_exercises']:
            if exName in session['existing_exercises']:
                exList = session['existing_exercises']
                exList.remove(exName)
                session['existing_exercises'] = exList
                message = 'Exercise removed'
                return render_template('createworkout.html', message=message, messageCategory='success')
        if session['new_exercises']:
            if exName in session['new_exercises'].keys():
                new_exercises = session['new_exercises']
                new_exercises.pop(exName)
                session['new_exercises'] = new_exercises
                message = 'Exercise removed'
                return render_template('createworkout.html', message=message, messageCategory='success')
        message = "Could  not remove exercise"
        return render_template('createworkout.html', message=message, messageCategory='danger')
    else:
        message='You must be logged in to edit workouts'
        return render_template('index.html', message=message, messageCategory='danger')

@app.route('/addexistingexercise.html')
def add_existing_exercise():
    if user_authenticated():
        existing_exercises = fetch_users_exercises()

        return render_template('addexistingexercise.html', existingExercises=existing_exercises)
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)

@app.get('/createexercise.html')
def create_exercise():
    if user_authenticated():
        return render_template('createexercise.html')
    else:
        message='You must be logged in to create exercises'
        return render_template('index.html', message=message, messageCategory='danger')


@app.route('/postworkout.html/')
def post_create_workout():
    if user_authenticated():
        if 'new_workout_name' not in session.keys():
            return render_template('createworkout.html', message='Must name workout to create it', messageCategory='danger')
        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f"SET NOCOUNT ON; DECLARE @rv int; EXEC @rv = build_workout_return_woID @workout_name='{session['new_workout_name']}', @user_id={session['user_id']}, @wo_id=5000; SELECT @rv AS return_value;"
        cursor.execute(query)
        workout_id = cursor.fetchval()
        cnxn.commit()
        print('new workout id ='+ str(workout_id))

        #workout created, use workout_id to associate exercises to workout
        #build individual exercises
        existingExerciseNames = fetch_all_exercise_names()
        if 'new_exercises' in session.keys():
            for exName in session['new_exercises'].keys():
                if exName in existingExerciseNames:
                    #exercise with exName already exist, just associate it with the workout
                    ex_id = get_exercise_id(exName)
                    print('ex_id=' + str(ex_id))
                    query = f"EXEC associate_exercise_with_workout {workout_id}, {ex_id};"
                    cursor.execute(query)
                    cnxn.commit()
                else:
                    #exercise with exName is new and needs to be added to exercises
                    ex_type = session['new_exercises'].get(exName)
                    ex_type_id = 0
                    if ex_type == 'Strength':
                        ex_type_id = 1
                    else:
                        ex_type_id = 2
                    query = f"SET NOCOUNT ON; DECLARE @rv int; EXEC @rv = build_exercise_return_exID '{exName}', {ex_type_id}, 0; SELECT @rv;"
                    cursor.execute(query)
                    ex_id = cursor.fetchval()
                    print('ex_id='+str(ex_id))
                    cnxn.commit()
                    query = f"EXEC associate_exercise_with_workout {workout_id}, {ex_id};"
                    cursor.execute(query)
                    cnxn.commit()
        if 'existing_exercises' in session.keys():
            for exName in session['existing_exercises']:
                ex_id = get_exercise_id(exName)
                print('existing_exercise_id=' + str(ex_id))
                query = f"EXEC associate_exercise_with_workout {workout_id}, {ex_id};"
                cursor.execute(query)
                cnxn.commit()
        cnxn.close()
        session.pop('new_workout_name')
        session.pop('new_exercises')
        session.pop('existing_exercises')
        message = 'Workout created successfully'
        return render_template(url_for('home'), message=message, messageCategory='success')
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)

@app.route('/deleteworkout')
def delete_workout():
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        return render_template('deleteworkout.html', workouts=users_workouts)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')

@app.route('/deleteworkout/')
def post_delete_workout():
    if user_authenticated():
        workout_id = request.args.get('workout_id')
        delete_workout(workout_id)
        return render_template('home.html', message='Workout Deleted', messageCategory='success')
    else:
        return render_template('index.html', message=message, messageCategory='danger')

def user_authenticated() -> bool:
    if session.get('user_id') is None:
        return False
    return True

def delete_user_account(user_id):
    cardio_sets = fetch_cardio_sets_by_user()
    if cardio_sets:
        for set in cardio_sets:
            delete_set(set.c_set_number, 'Cardio', set.wo_ex_id)
    strength_sets = fetch_strength_sets_by_user()
    if strength_sets:
        for set in strength_sets:
            delete_set(set.s_set_number, 'Strength', set.wo_ex_id)
    wo_ex_ids = fetch_wo_ex_ids_by_user()
    if wo_ex_ids:
        for id in wo_ex_ids:
                delete_wo_ex(id.wo_ex_id)
    seshs = fetch_sesh_ids_by_user()
    if seshs:
        for sesh in seshs:
            delete_sesh(sesh.sesh_id)
    workouts = fetch_all_user_workouts()
    if workouts:
        for workout in workouts:
                permanently_delete_workout(workout.workout_id)


        delete_user()
def fetch_wo_ex_ids_by_user():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_wo_ex_ids_by_user @user_id={session['user_id']};"
    cursor.execute(query)
    ids = cursor.fetchall()
    cnxn.close()
    return ids
def fetch_cardio_sets_by_user():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_cardio_sets_by_user @user_id=?;"
    cursor.execute(query, session['user_id'])
    sets = cursor.fetchall()
    cnxn.close()
    return sets
def fetch_sesh_ids_by_user():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f'EXEC fetch_sesh_ids_by_user @user_id={session["user_id"]}'
    cursor.execute(query)
    ids = cursor.fetchall()
    cnxn.close()
    return ids
def fetch_strength_sets_by_user():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_strength_sets_by_user @user_id=?;"
    cursor.execute(query, session['user_id'])
    sets = cursor.fetchall()
    cnxn.close()
    return sets
def delete_user():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"DELETE FROM Users WHERE user_id={session['user_id']};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
    session.clear()
def delete_workout(workout_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query=f"EXEC delete_workout @workout_id={int(workout_id)};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
def permanently_delete_workout(workout_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC permanently_delete_workout @workout_id={workout_id};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
def delete_sesh(sesh_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC delete_sesh @sesh_id={sesh_id};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
def delete_wo_ex(wo_ex_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC delete_wo_ex @wo_ex_id={wo_ex_id}"
    cursor.execute(query)
    cnxn.commit()
    print('wo_ex deleted')
    cnxn.close()
def delete_set(set_number, set_type, wo_ex_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC delete_set @set_number={set_number} , @set_type='{set_type}' , @wo_ex_id={wo_ex_id};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
    print('set deleted')

def fetch_users_workouts():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_user_workouts @user_id=?"
    params = session['user_id']
    cursor.execute(query, params)
    results = cursor.fetchall()
    cnxn.close()
    return results
def fetch_all_user_workouts():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_all_user_workouts @user_id=?"
    params = session['user_id']
    cursor.execute(query, params)
    results = cursor.fetchall()
    cnxn.close()
    return results

def fetch_users_exercises():
        cnxn = get_db()
        cursor = cnxn.cursor()
        query = "EXEC fetch_user_exercises "+str(session['user_id'])
        results = cursor.execute(query).fetchall()
        cnxn.close()
        return results;
def fetch_all_exercise_names() -> []:
    cnxn = get_db()
    cursor = cnxn.cursor()
    query='EXEC fetch_all_exercise_names;'
    results = cursor.execute(query).fetchall()
    ex_names = []
    for result in results:
        ex_names.append(result.exercise_name)
    cnxn.close()
    return ex_names
def get_exercise_id(exName) -> id:
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC get_exercise_id '{exName}', 0;"
    row = cursor.execute(query).fetchone()
    id = row[0]
    cnxn.close()
    return id

def get_exercises_by_workout(workout_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC get_exercises_by_workout @workout_id=?"
    cursor.execute(query, workout_id)
    results = cursor.fetchall()
    cnxn.close()
    return results




