
var localaddress = "127.0.0.1:5000";

function nameWorkout(){
    wo_name = document.getElementById('new_workout_name').value;
    window.location.href = 'createworkout.html/?wo_name='+wo_name;
}
function addExercise(name){
    window.location.href= 'createworkout.html/?existing_exercise='+name;
}
function createExercise(){
    ex_name = document.getElementById('new_exercise_name').value;
    ex_type = document.getElementById('exercise_type_input').value;
    window.location.href= 'createworkout.html/?new_exercise_name='+ex_name+'&new_exercise_type='+ex_type;
}
function removeExercise(name){
    window.location.href='/remove/?remove='+name;
}
function postWorkout(){
    window.location.href = '/postworkout.html/';
}


