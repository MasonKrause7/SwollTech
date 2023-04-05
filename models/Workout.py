import models.Exercise
class Workout:

    exercise_list = []
    def __init__(self, name):
        self.name = name

    def addExercise(self, exercise):
        ex = exercise
        exercise_list.append(ex)