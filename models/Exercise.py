class Exercise:

    def __init__(self, exercise_name, exercise_type_id):
        self.exercise_name = exercise_name
        self.exercise_type_id = exercise_type_id

    def edit_type(self, new_type_id):
        self.exercise_type_id = new_type_id

