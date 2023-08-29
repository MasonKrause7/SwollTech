from application import db

#build models here
class Users(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    fname = db.Column(db.String(80), unique=False, nullable=False)
    lname = db.Column(db.String(80), unique=False, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    dob = db.Column(db.DateTime, unique=False, nullable=False)
    passowrd = db.Column(db.String(200), unique=False, nullable=False)

class Sesh(db.Model):

class Workout(db.Model):

class Exercise(db.Model):

class Workout_Exercise(db.Model):

class Exercise_Type(db.Model):

class Cardio_Set(db.Model):

class Strength_Set(db.Model):

