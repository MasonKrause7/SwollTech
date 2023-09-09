from flask import Flask, render_template, request, session, redirect, url_for
from passlib.hash import pbkdf2_sha256
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import and_
import pandas as pd
import numpy as np
import json
import plotly
from plotly import utils
import plotly.express as px
from os import environ


application = Flask(__name__)
db = SQLAlchemy()

aws_uri=f"mysql://{environ.get('RDS_USERNAME')}:{environ.get('RDS_PASSWORD')}@{environ.get('RDS_HOSTNAME')}:{environ.get('RDS_PORT')}/{environ.get('RDS_DB_NAME')}"
uri = f"mysql://{'root'}:{'Bond7007!'}@{'localhost'}:3306/{'swolltech'}"
application.config['SQLALCHEMY_DATABASE_URI'] = aws_uri
application.config['SECRET_KEY'] = "as0k59r878lnkl"

db.init_app(application)

if __name__ == "__main__":
    application.run()

class Users(db.Model):

    user_id = db.Column(db.Integer, primary_key=True)
    fname = db.Column(db.String(80), unique=False, nullable=False)
    lname = db.Column(db.String(80), unique=False, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    dob = db.Column(db.DateTime, unique=False, nullable=False)
    password = db.Column(db.String(200), unique=False, nullable=False)

class Workout(db.Model):
    workout_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(Users.user_id))
    workout_name = db.Column(db.String(100), unique=False, nullable=False)
    deleted = db.Column(db.Boolean)

class Sesh(db.Model):
    sesh_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(Users.user_id))
    workout_id = db.Column(db.Integer, db.ForeignKey(Workout.workout_id))
    date_of_sesh = db.Column(db.DateTime, default=db.func.current_timestamp())
class Exercise_Type(db.Model):
    __tablename__ = 'exercise_type'
    exercise_type_id = db.Column(db.Integer, primary_key=True)
    exercise_type_name = db.Column(db.String(25))
class Exercise(db.Model):
    exercise_id = db.Column(db.Integer, primary_key=True)
    exercise_name = db.Column(db.String(80), nullable=False)
    exercise_type_id = db.Column(db.Integer, db.ForeignKey(Exercise_Type.exercise_type_id))
class Workout_Exercise(db.Model):
    __tablename__ = 'workout_exercise'
    wo_ex_id = db.Column(db.Integer, primary_key=True )
    workout_id = db.Column(db.Integer, db.ForeignKey(Workout.workout_id))
    exercise_id = db.Column(db.Integer, db.ForeignKey(Exercise.exercise_id))
    deleted = db.Column(db.Boolean)

class Cardio_Set(db.Model):
    __tablename__ = 'cardio_set'
    c_set_number = db.Column(db.Integer, primary_key=True)
    wo_ex_id = db.Column(db.Integer, db.ForeignKey(Workout_Exercise.wo_ex_id))
    sesh_id = db.Column(db.Integer, db.ForeignKey(Sesh.sesh_id))
    duration_amount = db.Column(db.Float)
    duration_metric = db.Column(db.String(50))
    distance_amount = db.Column(db.Float)
    distance_metric = db.Column(db.String(50))
class Strength_Set(db.Model):
    __tablename__ = 'strength_set'
    s_set_number = db.Column(db.Integer, primary_key=True)
    wo_ex_id = db.Column(db.Integer, db.ForeignKey(Workout_Exercise.wo_ex_id))
    sesh_id = db.Column(db.Integer, db.ForeignKey(Sesh.sesh_id))
    number_of_reps = db.Column(db.Integer)
    weight_amount = db.Column(db.Float)
    weight_metric = db.Column(db.String(25))

    def __init__(self, wo_ex_id, sesh_id, number_of_reps, weight_amount, weight_metric):
        self.wo_ex_id=wo_ex_id
        self.sesh_id=sesh_id
        self.number_of_reps=number_of_reps
        self.weight_amount=weight_amount
        self.weight_metric=weight_metric
@application.route('/')
def index():
    if user_authenticated():
        return redirect(url_for('home'))
    return render_template('index.html')


@application.route('/about.html')
def about():
    return render_template('about.html')


@application.get('/signup.html')
def get_signup():
    return render_template('signup.html')


@application.post('/signup.html')
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
        return render_template(url_for('get_signup'), message=message, messageCategory='danger', fname=fname, lname=lname, email=email, dob=dob, password=password)
    #check if user exists in db

    user = db.session.execute(db.select(Users).where(Users.email == email)).scalar_one_or_none()
    if user:  # if user already exists, render login
        message = "That email is already associated with an account, please log in instead"
        return render_template('login.html', message=message, messageCategory='danger')
    else: #valid new user, try adding to db
        try:
            hashword = pbkdf2_sha256.hash(password)
            user = Users(fname=fname, lname=lname, email=email, dob=dob, password=hashword)
            print(user.fname + " model created...")
            db.session.add(user)
            db.session.commit()
            print("User successfully commited to db")
            message = "Sign up successful. Please log in to your new account"
            return render_template(url_for('login'), message=message, messageCategory='success')

        except:
            db.session.delete(user)
            message = "There was an error during the sign up process. Please try again."
            print('Error committing user to db')
            return render_template(url_for('get_signup'), message=message, messageCategory='danger')


@application.route('/login.html', methods=['GET', 'POST'])
def login(user=None, message=""):
    if request.method == 'GET':
        return render_template('login.html')
    else:
        username = request.form.get('username')
        password = request.form.get('loginpassword')

        result = db.session.execute(db.select(Users).where(Users.email==username)).scalar_one_or_none()


        if not result:
            message = "No user exists with that email, please try again"
            return render_template(url_for('login'), message=message, messageCategory='danger')
        else:
            if pbkdf2_sha256.verify(password, result.password):
                session['logged_in'] = True
                session['user_id'] = result.user_id
                session['email'] = result.email
                session['fname'] = result.fname
                session['lname'] = result.lname
                return redirect(url_for('home'))
            else:
                message = "Sorry, that password is incorrect."
                return render_template(url_for('login'), message=message, messageCategory='danger')


@application.route('/logout')
def logout():
    if len(session.keys()) == 0:
        message = 'You were not logged in'
        return render_template('index.html', message=message, messageCategory='danger')
    session.clear()
    message = 'Successfully signed out'
    return render_template('index.html', message=message, messageCategory='success')


@application.route('/account.html')
def account():
    if user_authenticated():
        return render_template('account.html')
    else:
        message = 'You must be logged in to view your account. Please log in or register for a free account.'
        return render_template('index.html', message=message, messageCategory='danger')
@application.route('/account.html/')
def edit_account():
    if user_authenticated():
        action = request.args.get('action')
        if action == 'change_email':
            return render_template('changeemail.html')
        elif action == 'change_password':
            return render_template('changepassword.html')
        elif action == 'delete_account':
            return render_template('deleteaccount.html')
        return render_template('account.html')
    else:
        message = 'You must be logged in to view your account. Please log in or register for a free account.'
        return render_template('index.html', message=message, messageCategory='danger')
@application.post('/change_email/')
def change_email():
    if user_authenticated():
        new_email = request.form.get('new_email')

        password = request.form.get('password')

        user = db.session.execute(db.select(Users).where(Users.user_id==session['user_id'])).scalar_one_or_none()
        existing_password = user.password

        if password:
            if pbkdf2_sha256.verify(password, existing_password):
                print('passwords verified, updating user email')
                update_user_email(new_email)
                session['email'] = new_email
                return render_template('account.html', message='Email updated', messageCategory='success')
            else:
                message = 'That password is incorrect, please check your entry and try again.'
                return render_template('changeemail.html', message=message, messageCategory='danger')
        else:
            return render_template('changeemail.html', message='Password required to update account', messageCategory='danger')
    else:
        message = 'You are not logged in. Please log in or create an account.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.post('/change_password/')
def change_password():
    if user_authenticated():
        curr_password = request.form['curr_password']
        new_password = request.form['new_password']
        conf = request.form['conf_new_password']
        user = db.session.execute(db.select(Users).where(Users.user_id==session['user_id'])).scalar_one_or_none()
        if pbkdf2_sha256.verify(curr_password, user.password):
            if new_password == conf:
                update_user_password(new_password)
                return render_template('account.html', message='Password updated', messageCategory='success')
            else:
                return render_template('changepassword.html', message='Your new password did not match the password confirmation. Please double check your password and try again.', messageCategory='danger')
        else:
            message = 'That password is incorrect, please check your entry and try again.'
            return render_template('changepassword.html', message=message, messageCategory='danger')

    else:
        message = 'You are not logged in. Please log in or create an account'
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/deleteaccount/')
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
@application.route('/home.html/')
def home(message=None):
    if not user_authenticated():
        message = 'You must be logged in to access your home page'
        return render_template(url_for('login'), message=message, messageCategory='danger')

    # NEED TO BUILD USEFUL GRAPH DISPLAY HERE
    #find total number of workouts completed
    sesh_objs = Sesh.query.filter_by(user_id=session['user_id']).all()
    num_seshs = len(sesh_objs)
    return render_template('home.html', num_seshs=num_seshs)


@application.route('/viewworkout.html')
def view_workouts():
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        return render_template('viewworkout.html', users_workouts=users_workouts)
    else:
        message = 'You must be logged in to view workouts. Please log in or make an account'
        return render_template('index.html', message=message, messageCategory='danger')
@application.route('/viewworkout.html/')
def view_workout():
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        workout_id = request.args.get('workout_id')
        workout_name = request.args.get('workout_name')
        exercises = get_exercises_by_workout(workout_id)
        formatted_date_time = None

        strength_sets = fetch_last_workout_strength_sets(workout_id)

        ss = {}
        if strength_sets:
            sesh = Sesh.query.filter_by(sesh_id=strength_sets[0].sesh_id).first()

            for set in strength_sets:
                wo_ex = Workout_Exercise.query.filter_by(wo_ex_id=set.wo_ex_id).first()
                ex = Exercise.query.filter_by(exercise_id=wo_ex.exercise_id).first()
                ss.update({set.s_set_number : ex.exercise_name})
                datetime = str(sesh.date_of_sesh)
                formatted_date_time = format_time(datetime)

        cardio_sets = fetch_last_workout_cardio_sets(workout_id)
        cs = {}

        if cardio_sets:
            sesh = Sesh.query.filter_by(sesh_id=cardio_sets[0].sesh_id).first()
            for set in cardio_sets:
                wo_ex = Workout_Exercise.query.filter_by(wo_ex_id=set.wo_ex_id).first()
                ex = Exercise.query.filter_by(exercise_id=wo_ex.exercise_id).first()
                cs.update({set.c_set_number : ex.exercise_name})
                datetime = str(sesh.date_of_sesh)
                formatted_date_time = format_time(datetime)

        seshs = Sesh.query.filter(Sesh.workout_id==workout_id, Sesh.user_id==session['user_id']).order_by(Sesh.date_of_sesh.desc()).all()
        seshs = seshs[1:]
        dates = []
        for sesh in seshs:
            dates.append(format_time(str(sesh.date_of_sesh)))
        if len(dates) == 0:
            dates = None
        return render_template('viewworkout.html', users_workouts=users_workouts, exercises=exercises, workout_name=workout_name, ss=ss, strength_sets=strength_sets, cs=cs, cardio_sets=cardio_sets, num_times=len(seshs)+1, dates=dates, formatted_time=formatted_date_time)
    else:
        message = 'You must be logged in to view workouts. Please log in or make an account'
        return render_template('index.html', message=message, messageCategory='danger')

@application.get('/createworkout.html/')
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
        return render_template(url_for('login.html'), message=message, messageCategory='danger')
@application.get('/nameworkout.html')
def name_workout():
    if user_authenticated():
            return render_template('nameworkout.html')
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message, messageCategory='danger')

@application.route('/remove/')
def remove_exercise():
    if user_authenticated():
        exName = request.args.get('remove')
        if 'existing_exercises' in session.keys():
            if session['existing_exercises']:
                if exName in session['existing_exercises']:
                    exList = session['existing_exercises']
                    exList.remove(exName)
                    session['existing_exercises'] = exList
                    message = 'Exercise removed'
                    return render_template('createworkout.html', message=message, messageCategory='success')
        if 'new_exercises' in session.keys():
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

@application.route('/addexistingexercise.html')
def add_existing_exercise():
    if user_authenticated():
        existing_exercises = fetch_users_exercises()
        if existing_exercises:

            return render_template('addexistingexercise.html', existingExercises=existing_exercises)
        else:
            return render_template('createworkout.html', message="You don't have any existing exercises, create new exercises to build your first workout", messageCategory='danger')


    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)

@application.get('/createexercise.html')
def create_exercise():
    if user_authenticated():
        return render_template('createexercise.html')
    else:
        message='You must be logged in to create exercises'
        return render_template('index.html', message=message, messageCategory='danger')


@application.route('/postworkout.html/')
def post_create_workout():
    if user_authenticated():
        if 'new_workout_name' not in session.keys():
            return render_template('createworkout.html', message='Must name workout to create it', messageCategory='danger')
        #make sure user doesnt have any other workouts with the same name
        workouts = Workout.query.filter_by(user_id=session['user_id']).all()
        workout_names = []
        for workout in workouts:
            workout_names.append(workout.workout_name)
        if session['new_workout_name'] in workout_names:
            return render_template('createworkout.html', message='That workout name is in use for another workout, please rename your workout and recreate', messageCategory='danger')

        workout = Workout(
            user_id=session['user_id'],
            workout_name=session['new_workout_name'],
            deleted=0
        )
        db.session.add(workout)
        db.session.commit()
        wo = Workout.query.filter(Workout.user_id==session['user_id'], Workout.workout_name==session['new_workout_name']).first()
        workout_id = wo.workout_id

        #workout created, use workout_id to associate exercises to workout
        #build individual exercises
        existingExerciseNames = fetch_all_exercise_names()
        if 'new_exercises' in session.keys():
            for exName in session['new_exercises'].keys():
                if exName in existingExerciseNames:
                    #exercise with exName already exist, just associate it with the workout
                    ex_id = get_exercise_id(exName)
                    wo_ex = Workout_Exercise(
                        workout_id=session['workout_in_progress_id'],
                        exercise_id=ex_id,
                        deleted=0
                    )
                    db.session.add(wo_ex)
                    db.session.commit()

                else:
                    #exercise with exName is new and needs to be added to exercises
                    ex_type = session['new_exercises'].get(exName)
                    ex_type_id = 0
                    if ex_type == 'Strength':
                        ex_type_id = 1
                    else:
                        ex_type_id = 2

                    exercise = Exercise(
                        exercise_name=exName,
                        exercise_type_id=ex_type_id
                    )
                    db.session.add(exercise)
                    db.session.commit()
                    exercise = Exercise.query.filter(Exercise.exercise_name==exName, Exercise.exercise_type_id==ex_type_id).first()
                    exercise_id = exercise.exercise_id
                    workout_exercise = Workout_Exercise(
                        workout_id=workout_id,
                        exercise_id=exercise_id,
                        deleted=0
                    )
                    db.session.add(workout_exercise)
                    db.session.commit()
        if 'existing_exercises' in session.keys():
            for exName in session['existing_exercises']:
                ex_id = get_exercise_id(exName)
                workout_exercise = Workout_Exercise(
                    workout_id=workout_id,
                    exercise_id=ex_id,
                    deleted=0
                )
                db.session.add(workout_exercise)
                db.session.commit()
        if 'new_workout_name' in session.keys():
            session.pop('new_workout_name')
        if 'new_exercises' in session.keys():
            session.pop('new_exercises')
        if 'existing_exercises' in session.keys():
            session.pop('existing_exercises')
        message = 'Workout created successfully'

        return redirect(url_for('home'))
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)

@application.route('/deleteworkout')
def delete_workout():
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        return render_template('deleteworkout.html', workouts=users_workouts)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/deleteworkout/')
def post_delete_workout():
    if user_authenticated():
        workout_id = request.args.get('workout_id')
        delete_workout(workout_id)
        return redirect(url_for('home'))
    else:
        message = 'You are not logged in. Please log in or sign up to continue.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/editworkout')
def select_edit_workout():
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        return render_template('editworkout.html', users_workouts=users_workouts)
    else:
        message = 'You are not logged in. Please log in or sign up to continue.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/editworkout/')
def edit_workout():
    if user_authenticated():
        workout_id = request.args.get('workout_id')
        exercises = get_exercises_by_workout(workout_id)
        users_workouts = fetch_users_workouts()
        workout = Workout.query.filter_by(workout_id=workout_id).first()
        session['workout_name'] = workout.workout_name

        return render_template('editworkout.html', users_workouts=users_workouts, exercises=exercises, workout=workout, workout_id=workout_id)
    else:
        message = 'You are not logged in. Please sign up or log in to continue.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.get('/changename/')
def change_workout_name():
    if user_authenticated():
        workout_id = request.args.get('workout_id')
        session['workout_under_edit'] = workout_id
        workout_name = request.args.get('workout_name')
        return render_template('changename.html', workout_name=workout_name, workout_id=workout_id)
    else:
        message = 'You are not logged in. Please sign up or log in to continue.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.post('/postworkoutname/')
def post_change_workout_name():
    if user_authenticated():
        new_workout_name = request.form.get('new_workout_name')
        workout = Workout.query.filter_by(workout_id=session['workout_under_edit']).first()
        workout.workout_name = new_workout_name
        db.session.commit()
        message = 'Workout name has been changed. You can find it in your workouts under the new name: '+new_workout_name
        return redirect(url_for('home'))
    else:
        message = 'You are not logged in. Please sign up or log in to continue.'
        return render_template('index.html', message=message, messageCategory='danger')


@application.route('/addexercises/')
def add_exercises_to_workout():
    workout_id = request.args.get('workout_id')
    session['workout_under_edit'] = workout_id
    workout_name = request.args.get('workout_name')
    build_workout_ex_list_and_showable_ex_list()

    return render_template('addexercisetoworkout.html', workout_id=workout_id, workout_name=workout_name, workoutExercises=session['workout_exercises'], userExercises=session['showable_exercises'])
@application.route('/editworkout_addexistingexercise/')
def edit_workout_add_existing_exercises():
    if user_authenticated():
        exercise_id = request.args.get('ex_id')
        workout = Workout.query.filter_by(workout_id=session['workout_under_edit']).first()
        workout_name = workout.workout_name
        exercise = Exercise.query.filter_by(exercise_id=exercise_id).first()


        dup = Workout_Exercise.query.filter(Workout_Exercise.workout_id==workout.workout_id, Workout_Exercise.exercise_id==exercise_id).first()
        if dup:
            if dup.deleted != 0:
                dup.deleted = 0
                db.session.commit()
                build_workout_ex_list_and_showable_ex_list()
            return render_template('addexercisetoworkout.html', workout_id=session['workout_under_edit'], workout_name=workout_name, workoutExercises=session['workout_exercises'], userExercises=session['showable_exercises'])
        else:
            workout_exercise = Workout_Exercise(
                workout_id=workout.workout_id,
                exercise_id=exercise_id,
                deleted=0
            )
            db.session.add(workout_exercise)
            db.session.commit()
            build_workout_ex_list_and_showable_ex_list()

            return render_template('addexercisetoworkout.html', workout_id=session['workout_under_edit'], workout_name=workout_name, workoutExercises=session['workout_exercises'], userExercises=session['showable_exercises'] )
    else:
        message = 'You are not logged in. Please sign up or log in to continue.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/buildexforwo/')
def build_exercise_for_workout():

    if user_authenticated():
        exercise_name = request.args.get('exercise_name')
        exercise_type = request.args.get('exercise_type')
        workouts = Workout.query.filter_by(user_id=session['user_id']).all()
        workout_ids = []
        for workout in workouts:
            workout_ids.append(workout.workout_id)
        wo_exs = Workout_Exercise.query.filter(Workout_Exercise.workout_id.in_(workout_ids)).all()
        ex_ids = []
        for wo_ex in wo_exs:
            ex_ids.append(wo_ex.exercise_id)
        exercises = Exercise.query.filter(Exercise.exercise_id.in_(ex_ids)).all()
        exercise_names = []
        for exercise in exercises:
            exercise_names.append(exercise.exercise_name)

        #exercise already exists for user, so just associate it with the workout
        if exercise_name in exercise_names:
            ex_id = get_exercise_id(exercise_name)
            wo_ex = Workout_Exercise(
                workout_id=session['workout_under_edit'],
                exercise_id=ex_id,
                deleted=0
            )
            db.session.add(wo_ex)
            db.session.commit()
        else:
            if exercise_type == 'Strength':
                exercise = Exercise(
                    exercise_name=exercise_name,
                    exercise_type_id=1
                )
                db.session.add(exercise)
                db.session.commit()
            elif exercise_type == 'Cardio':
                exercise = Exercise(
                    exercise_name=exercise_name,
                    exercise_type_id=2
                )
                db.session.add(exercise)
                db.session.commit()

            ex_id = get_exercise_id(exercise_name)
            workout_exercise = Workout_Exercise(
                workout_id=session['workout_under_edit'],
                exercise_id=ex_id,
                deleted=0
            )
            db.session.add(workout_exercise)
            db.session.commit()

        build_workout_ex_list_and_showable_ex_list()
        return render_template('addexercisetoworkout.html', workout_id=session['workout_under_edit'],
                               workout_name=session['workout_name'], workoutExercises=session['workout_exercises'],
                               userExercises=session['showable_exercises'])
    else:
        message = "You are not logged in, please sign up or make an account to continue."
        return render_template('index.html', message=message, messageCategory='danger')


@application.route('/removeexercisefromworkout/')
def remove_exercise_from_workout():
    ex_id = request.args.get('ex_id')
    wo_id = request.args.get('wo_id')

    #mark wo_ex_id with deleted=1
    wo_ex = db.session.execute(db.select(Workout_Exercise).filter(Workout_Exercise.workout_id==wo_id, Workout_Exercise.exercise_id==ex_id)).scalar_one_or_none()
    wo_ex.deleted=1
    db.session.commit()

    workout_name = db.session.execute(db.select(Workout).where(Workout.workout_id==wo_id))
    build_workout_ex_list_and_showable_ex_list()
    return render_template('addexercisetoworkout.html', workout_id=session['workout_under_edit'],
                           workout_name=workout_name, workoutExercises=session['workout_exercises'],
                           userExercises=session['showable_exercises'])


@application.route('/selectworkout')
def select_workout():
    if user_authenticated():
        workouts = fetch_users_workouts()
        return render_template('selectworkout.html', workouts=workouts)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')
@application.route('/displayselectedworkout/')
def display_selected_workout():
    if user_authenticated():
        workouts = fetch_users_workouts()
        wo_id = request.args.get('workout_id')
        workout_name = get_workout_name(wo_id)
        exercises = get_exercises_by_workout(wo_id)

        return render_template('selectworkout.html', workouts=workouts, wo_id=wo_id, wo_name=workout_name, workout_exercises=exercises)

    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/startworkout/')
def start_workout():
    if user_authenticated():
        wo_id = request.args.get('workout_id')
        session['workout_in_progress_id'] = wo_id
        session['workout_in_progress_name'] = get_workout_name(wo_id)
        starting = request.args.get('starting')
        if starting == 'True':
            sesh = build_sesh()
            session['sesh_in_progress_id'] = sesh.sesh_id
            session['sesh_in_progress_date'] = str(sesh.date_of_sesh)

        date = session['sesh_in_progress_date']
        formatted_date_time= format_time(date)

        session['exercises_with_sets'] = {}
        exercises = get_exercises_by_workout(wo_id)

        markExercises()
        wo_ex_to_ex = {}
        for ex in exercises:
            wo_ex = Workout_Exercise.query.filter(Workout_Exercise.workout_id == wo_id, Workout_Exercise.exercise_id ==ex.exercise_id).first()
            wo_ex_to_ex.update({ex.exercise_name : wo_ex.wo_ex_id})

        return render_template('workoutsesh.html', exercises=exercises, formatted_date_time=formatted_date_time, wo_ex_to_ex=wo_ex_to_ex)

    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/startexercise/')
def start_exercise():
    if user_authenticated():
        ex_id = request.args.get('ex_id')
        session['ex_in_progress'] = ex_id
        #get the workout_exercise and the exercise itself
        if ex_id:
            exercise = Exercise.query.filter_by(exercise_id=ex_id).first()
            wo_ex = Workout_Exercise.query.filter(Workout_Exercise.exercise_id==ex_id, Workout_Exercise.workout_id==session['workout_in_progress_id']).first()
            session['current_wo_ex_id'] = wo_ex.wo_ex_id
        else:
            wo_ex = Workout_Exercise.query.filter_by(wo_ex_id=session['current_wo_ex_id']).first()
            exercise_id = wo_ex.exercise_id
            exercise = Exercise.query.filter_by(exercise_id=exercise_id).first()
        #get the sets theyve completed of this exercise so far during this workout, one of these will return nothing
        completed_strength_sets = Strength_Set.query.filter(Strength_Set.sesh_id==session['sesh_in_progress_id'], Strength_Set.wo_ex_id==session['current_wo_ex_id']).all()
        completed_cardio_sets = Cardio_Set.query.filter(Cardio_Set.sesh_id==session['sesh_in_progress_id'], Cardio_Set.wo_ex_id==session['current_wo_ex_id']).all()

        #fetch sets from last workout
        if ex_id:
            sets = fetch_last_workout_sets_by_exercise(ex_id) #this gets the sets from last workout, or returns none
            print('SETS:')
            print(sets)

            if sets and len(sets) > 0:
                #these are sets that were completed during this workout, not last
                sesh = Sesh.query.filter_by(sesh_id=sets[0].sesh_id).first()
                if str(sesh.date_of_sesh) == session['sesh_in_progress_date']:
                    return render_template('doexercise.html', sesh=sesh, exercise=exercise, completed_cardio_sets=completed_cardio_sets, completed_strength_sets=completed_strength_sets)
                #if there were no sets from a previous workout
                return render_template('doexercise.html', sesh=sesh, exercise=exercise, last_workout_sets=sets, completed_cardio_sets=completed_cardio_sets, completed_strength_sets=completed_strength_sets)
            return render_template('doexercise.html', exercise=exercise, completed_cardio_sets=completed_cardio_sets, completed_strength_sets=completed_strength_sets)

        else:
            sets = fetch_last_workout_sets_by_exercise(exercise_id)
            if sets and len(sets) > 0:
                sesh = Sesh.query.filter_by(sesh_id=sets[0].sesh_id).first()

                formatted_date_time = format_time(sesh.date_of_sesh)

                return render_template('doexercise.html', exercise=exercise, last_workout_sets=sets, completed_cardio_sets=completed_cardio_sets, completed_strength_sets=completed_strength_sets, formatted_time=formatted_date_time)
            return render_template('doexercise.html', exercise=exercise, completed_cardio_sets=completed_cardio_sets, completed_strength_sets=completed_strength_sets,formatted_time=formatted_date_time)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')
@application.route('/submitstrengthset/')
def submit_strength_set():
    if user_authenticated():
        num_reps = request.args['numReps']
        weight_amount = request.args['amntWeight']
        weight_metric = request.args['weightMetric']
        wo_ex_id = session['current_wo_ex_id']
        submitStrengthSet(wo_ex_id, session['sesh_in_progress_id'], int(num_reps), float(weight_amount), str(weight_metric))
        # set is submitted, reload all the completed sets so far
        completed_strength_sets = Strength_Set.query.filter(Strength_Set.sesh_id == session['sesh_in_progress_id'], Strength_Set.wo_ex_id == session['current_wo_ex_id']).all()
        wo_ex = Workout_Exercise.query.filter_by(wo_ex_id=wo_ex_id).first()
        last_workout_sets = fetch_last_workout_sets_by_exercise(session['ex_in_progress'])
        exercise = Exercise.query.filter_by(exercise_id=wo_ex.exercise_id).first()

        return render_template('doexercise.html', message='Set submitted!', exercise=exercise, messageCategory='success', last_workout_sets=last_workout_sets, completedSets=completed_strength_sets)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')

#UPDATED, NEEDS TESTING
@application.route('/submitcardioset/')
def submit_cardio_set():
    if user_authenticated():
        wo_ex_id = session['current_wo_ex_id']
        sesh_id = session['sesh_in_progress_id']
        duration_amnt = request.args['duration_amnt']
        duration_metric = request.args['duration_metric']
        distance_amnt = request.args['distanceAmnt']
        distance_metric = request.args['distanceMetric']
        submitCardioSet(int(wo_ex_id), int(sesh_id), float(duration_amnt), str(duration_metric), float(distance_amnt), str(distance_metric))
        #set is submitted, reload all the completed sets so far
        workout_exercise = db.session.execute(db.select(Workout_Exercise).where(Workout_Exercise.wo_ex_id==wo_ex_id)).scalar_one_or_none()
        exercise = db.session.execute(db.select(Exercise).where(Exercise.exercise_id==workout_exercise.exercise_id)).scalar_one_or_none()
        completed_sets = db.session.execute(db.select(Cardio_Set).filter(Cardio_Set.sesh_id==sesh_id, Cardio_Set.wo_ex_id==wo_ex_id)).scalars()
        last_workout_sets = fetch_last_workout_sets_by_exercise(session['ex_in_progress'])
        return render_template('doexercise.html', exercise=exercise, completedSets=completed_sets, last_workout_sets=last_workout_sets)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')


@application.route('/deleteset/')
def delete_set():
    set_id = request.args.get('set_id')
    db.session.execute(db.session.delete(Cardio_Set).where(Cardio_Set.c_set_number == set_id))
    db.session.commit()
    db.session.execute(db.session.delete(Strength_Set).where(Strength_Set.s_set_number == set_id))
    db.session.commit()
    return redirect(url_for('start_exercise'))

@application.route('/endworkout/')
def end_workout():
    if user_authenticated():
        workout_name = session['workout_in_progress_name']

        message = f"{workout_name} completed. Nice work!"
        return redirect(url_for('home'))


    else:
        message = "You are not logged in. Please login or create an account to continue."
        return render_template('index.html', message=message, messageCategory='danger')

def format_time(datetime):
    print('DATETIME=')
    print(str(datetime))
    datetime = str(datetime)
    months = {1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June', 7: 'July', 8: 'August',
              9: 'September', 10: 'October', 11: 'November', 12: 'December'}
    hours = datetime[11:13]
    minutes = datetime[14:16]
    seconds = datetime[17:19]
    year = datetime[:4]
    month = datetime[5:7]
    day = datetime[8:10]
    signifier = 'am'
    if hours == '00':
        hours = '12'
    if int(hours) > 12:
        timei = int(hours) - 12
        signifier = 'pm'
        hours = str(timei)
    formatted_date_time = f"{months.get(int(month))} {day}, {year} at {hours}:{minutes}:{seconds}{signifier}"
    return formatted_date_time

#UPDATED, NEEDS TESTING
def fetch_last_workout_strength_sets(workout_id):
    sesh = Sesh.query.filter(Sesh.workout_id==workout_id).order_by(Sesh.date_of_sesh.desc()).first()
    if sesh:
        sets = Strength_Set.query.filter(Strength_Set.sesh_id==sesh.sesh_id).all()
        return sets
    else:
        return None

#UPDATED, NEEDS TESTING
def fetch_last_workout_cardio_sets(workout_id):
    sesh = Sesh.query.filter_by(workout_id=workout_id).order_by(Sesh.date_of_sesh).first()
    if sesh:
        sets = Cardio_Set.query.filter_by(sesh_id=sesh.sesh_id).all()
        return sets
    else:
        return None

#UPDATED BUT NEEDS SERIOUS TESTING
def fetch_last_workout_sets_by_exercise(exercise_id):
    seshs = Sesh.query.filter(Sesh.workout_id==session['workout_in_progress_id']).order_by(Sesh.date_of_sesh.desc()).limit(2).all()
    print('SESHS:')
    print(seshs)
    if seshs is None or len(seshs) == 1:
        return None
    else:
        sesh = seshs[1]

    wo_ex = Workout_Exercise.query.filter(Workout_Exercise.workout_id==session['workout_in_progress_id'], Workout_Exercise.exercise_id==exercise_id).first()
    exercise = Exercise.query.filter_by(exercise_id=exercise_id).first()
    if exercise.exercise_type_id == 1:
        #find strength sets
        sets = Strength_Set.query.filter(Strength_Set.sesh_id==sesh.sesh_id, Strength_Set.wo_ex_id==wo_ex.wo_ex_id).all()

    else:
        #find cardio sets
        sets = Cardio_Set.query.filter(Cardio_Set.sesh_id==sesh.sesh_id, Cardio_Set.wo_ex_id==wo_ex.wo_ex_id).all()

    return sets

#UPDATED, NEEDS TESTED
def markExercises():
    #use session['sesh_in_progress_id']
    #to load session['exercises_with_sets']
    #with the wo_ex_id : True if there is a
    #set completed for the sesh in progress
    sesh = Sesh.query.filter_by(sesh_id=session['sesh_in_progress_id']).first()
    strength_sets = Strength_Set.query.filter_by(sesh_id=sesh.sesh_id).all()
    cardio_sets = Cardio_Set.query.filter_by(sesh_id=sesh.sesh_id).all()
    for set in strength_sets:
        session['exercises_with_sets'].update({set.wo_ex_id : True})
    for set in cardio_sets:
        session['exercises_with_sets'].update({set.wo_ex_id : True})

#UPDATED, NEEDS TESTED
def submitStrengthSet(wo_ex_id, sesh_id, num_reps, weight_amount, weight_metric):

    strength_set = Strength_Set(
        wo_ex_id=wo_ex_id,
        sesh_id=sesh_id,
        number_of_reps=num_reps,
        weight_amount=weight_amount,
        weight_metric=weight_metric
    )
    db.session.add(strength_set)
    db.session.commit()
    db.session.refresh(strength_set)
    return strength_set.s_set_number

#UPDATED, NEEDS TESTED
def submitCardioSet(wo_ex_id, sesh_id, duration_amount, duration_metric, distance_amount, distance_metric):
    cardio_set = Cardio_Set(
        wo_ex_id=int(wo_ex_id),
        sesh_id=int(sesh_id),
        duration_amount=float(duration_amount),
        duration_metric=str(duration_metric),
        distance_amount=float(distance_amount),
        distance_metric=str(distance_metric)
    )
    db.session.add(cardio_set)
    db.session.commit()
    db.session.refresh(cardio_set)
    return cardio_set.c_set_number

#UPDATED, NEEDS TESTED
def get_workout_name(workout_id):
     workout = db.session.execute(db.select(Workout).where(Workout.workout_id == workout_id)).scalar_one_or_none()
     return workout.workout_name

# UPDATED, NEEDS TESTED
def build_sesh():
    sesh = Sesh(
        user_id=session['user_id'],
        workout_id=session['workout_in_progress_id']

    )
    db.session.add(sesh)
    db.session.commit()
    db.session.refresh(sesh)
    return sesh

#UPDATED, NEEDS TESTED
def user_authenticated():
    if session.get('user_id') is None:
        return False
    return True

#UPDATED, TESTED
def update_user_email(new_email):
    db.session.execute(db.update(Users).where(Users.user_id == session['user_id']).values(email=new_email))
    db.session.commit()
    print('email updated')

#UPDATED
def update_user_password(new_password):
    hashword = pbkdf2_sha256.hash(new_password)
    db.session.execute(db.update(Users).where(Users.user_id == session['user_id']).values(password=hashword))
    db.session.commit()
    print('password upated')

#UPDATED, NEEDS TESTED
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
            delete_wo_ex(id)
    seshs = fetch_sesh_ids_by_user()
    if seshs:
        for sesh in seshs:
            delete_sesh(sesh.sesh_id)
    workouts = fetch_all_user_workouts()
    if workouts:
        for workout in workouts:
                permanently_delete_workout(workout.workout_id)
        delete_user()

#UPDATED, NEEDS TESTED
def fetch_wo_ex_ids_by_user():
    users_workouts = Workout.query.filter_by(user_id=session['user_id']).all()
    workout_ids = []
    for workout in users_workouts:
        workout_ids.append(workout.workout_id)
    workout_exercises = Workout_Exercise.query.filter(Workout_Exercise.workout_id.in_(workout_ids)).all()
    wo_ex_ids = []
    for wo_ex in workout_exercises:
        wo_ex_ids.append(wo_ex.wo_ex_id)
    return wo_ex_ids

#UPDATED, NEEDS TESTED
def fetch_cardio_sets_by_user():
    wo_ex_ids = fetch_wo_ex_ids_by_user()
    sets = db.session.execute(db.select(Cardio_Set).where(Cardio_Set.wo_ex_id.in_(wo_ex_ids))).scalars()
    return sets

#UPDATED, NEEDS TESTED
def fetch_sesh_ids_by_user():
    ids = db.session.execute(db.select(Sesh).where(Sesh.user_id==session['user_id'])).scalars()
    return ids

#UPDATED, NEEDS TESTED
def fetch_strength_sets_by_user():
    #use the session['user_id'] to get
    # all strength sets associated with this user
    wo_ex_ids = fetch_wo_ex_ids_by_user()
    sets = db.session.execute(db.select(Strength_Set).where(Strength_Set.wo_ex_id.in_(wo_ex_ids))).scalars()
    return sets

#UPDATED, NEEDS TESTED
def delete_user():
    db.session.delete(Users).where(Users.user_id==session['user_id'])
    db.session.commit()
    session.clear()

#UPDATED, NEEDS TESTED
def delete_workout(workout_id):
    workout = db.session.execute(db.select(Workout).where(Workout.workout_id==workout_id)).scalar_one_or_none()
    if not workout:
        print("Error, could not find the workout with that workout_id")
    workout.deleted = 1
    db.session.commit()

#UPDATED, NEEDS TESTED
def permanently_delete_workout(workout_id):
    db.session.delete(Workout).where(Workout.workout_id==workout_id)
    db.session.commit()

#UPDATED, NEEDS TESTED
def delete_sesh(sesh_id):
    db.session.delete(Sesh).where(Sesh.sesh_id==sesh_id)
    db.commit()

#UPDATED, NEEDS TESTED
def delete_wo_ex(wo_ex_id):
    db.session.execute(db.session.delete(Workout_Exercise).where(Workout_Exercise.wo_ex_id==wo_ex_id))
    db.session.commit()

#UPDATED, NEEDS TESTED
def delete_set(set_number, set_type, wo_ex_id):

    if set_type == 'Cardio':
        db.session.execute(db.session.delete(Cardio_Set).filter(Cardio_Set.c_set_number == set_number, Cardio_Set.wo_ex_id==wo_ex_id))
        db.session.commit()
    elif set_type == 'Strength':
        db.session.execute(db.session.delete(Strength_Set).filter(Strength_Set.s_set_number == set_number, Strength_Set.wo_ex_id==wo_ex_id))
        db.session.commit()
    else:
        print('invalid set type')

#UPDATED, NEEDS TESTED
def fetch_users_workouts():
    workouts = Workout.query.filter(Workout.user_id == session['user_id'], Workout.deleted == 0).all()
    return workouts

#UPDATED, NEEDS TESTED
def fetch_all_user_workouts():
    results = db.session.execute(db.select(Workout).where(Workout.user_id == session['user_id'])).scalars()
    return results

#UPDATED, NEEDS TESTED
def fetch_users_exercises():
        #figure out how to get the exercises based on user_id ->
        # 1. get all of a users workouts
        users_workouts = Workout.query.filter_by(user_id=session['user_id']).all()
        workout_ids = []
        for workout in users_workouts:
            workout_ids.append(workout.workout_id)
        #workout_ids now holds all the workouts for this user
        # 2. get all the exercises that haven't been deleted
        print(workout_ids)
        if workout_ids:
            results = Workout_Exercise.query.filter(Workout_Exercise.workout_id.in_(workout_ids), Workout_Exercise.deleted==0).all()
            ex_ids = []
            for result in results:
                ex_ids.append(result.exercise_id)
            exercises = Exercise.query.filter(Exercise.exercise_id.in_(ex_ids)).all()
            #now we have all the users exercises(that haven't been deleted) in results
            return exercises

#UPDATED, NEEDS TESTED
def fetch_all_exercise_names() -> []:
    results = Exercise.query.all()
    if results:
        ex_names = []
        for result in results:
            ex_names.append(result.exercise_name)
        return ex_names
    else:
        return None

#UPDATED, NEEDS TESTED
def get_exercise_id(exName) -> id:
    ex = db.session.execute(db.select(Exercise).where(Exercise.exercise_name == exName)).scalar_one_or_none()
    id = ex.exercise_id
    return id

#UPDATED, NEEDS TESTED
def get_exercises_by_workout(workout_id):
    results = Workout_Exercise.query.filter(Workout_Exercise.workout_id==workout_id).all()
    ex_ids = []
    for result in results:
        if result.deleted is None or result.deleted == 0:

            ex_ids.append(result.exercise_id)
            if 'exercises_with_sets' in session.keys():
                session['exercises_with_sets'].update({result.wo_ex_id: False})
                #^this line loads 'exercises_with_sets' with the exercises to be done this workout.
    exercises = Exercise.query.filter(Exercise.exercise_id.in_(ex_ids)).all()
    return exercises

#UPDATED, NEEDS TESTED
def build_workout_ex_list_and_showable_ex_list():
    #1. get the list of exercises for this workout
    #2. build a dict with exercise_id : exercise_name .... save this to session['workout_exercises']
    #3. get all of a users exercises, save them in a dict similar fashion at session['showable_exercises']
    #4.
    exercises = get_exercises_by_workout(session['workout_under_edit'])
    if exercises:
        exs = {}
        for exercise in exercises:
            exs.update({exercise.exercise_id:exercise.exercise_name})
        session['workout_exercises'] = exs
    user_exercises = fetch_users_exercises()
    if user_exercises:
        showable_exercises = {}
        for exercise in user_exercises:
            showable_exercises.update({exercise.exercise_id: exercise.exercise_name})
        keys = []
        for key in showable_exercises.keys():
            keys.append(key)
        for id in keys:
            if id in exs.keys():
                showable_exercises.pop(id)
        session['showable_exercises'] = showable_exercises